import * as canvas from "./canvas.js";
import { settings, localTasks, cacheGet, cacheSet } from "./storage.js";

const PROJECT_RE = /(project|essay|paper|lab report|portfolio)/i;

export function courseTypeFor(course) {
  const id = String(course.id);
  const s = settings();
  if (s.courseTypes?.[id]) return s.courseTypes[id];
  const hay = `${course.name} ${course.code}`;
  if (/\bAP\b/i.test(hay) || /AP[- ]?[0-9A-Z]/i.test(hay)) return "ap";
  if (/honors|honor/i.test(hay)) return "honors";
  return "regular";
}

function typeOf(assignment) {
  const name = assignment.name || "";
  const types = assignment.submission_types || [];
  const isQuizish = types.includes("online_quiz") || assignment.quiz_id;
  if (isQuizish || /\bquiz(zes|z)?\b/i.test(name)) return "quiz";
  if (/(final|midterm|exam|test|unit test|assessment)/i.test(name)) return "exam";
  if (PROJECT_RE.test(name)) return "project";
  return "assignment";
}

function normalizeAssignment(course, group, a) {
  const sub = a.submission || {};
  const submitted = sub.workflow_state === "submitted" || sub.workflow_state === "graded" || sub.graded_at;
  const type = typeOf(a);
  return {
    id: `${course.id}-${a.id}`,
    canvasId: a.id,
    courseId: course.id,
    courseName: course.name,
    courseCode: course.code,
    title: a.name,
    type,
    dueAt: a.due_at || null,
    pointsPossible: a.points_possible || 0,
    pointsEarned: sub.score ?? null,
    submitted,
    needsGrading: sub.workflow_state === "pending_review" || sub.workflow_state === "submitted",
    htmlUrl: a.html_url || a.url || null,
    submissionTypes: Array.isArray(a.submission_types) ? a.submission_types : null,
    groupId: group.id,
    groupName: group.name,
    groupWeight: group.group_weight ?? null,
    lockExplanation: a.explanation,
    locked: a.locked_for_user || false,
    baseMinutes: Math.round((a.points_possible || 0) * settings().baseMinutesPerPoint),
    difficultyOverride: settings().difficultyOverrides?.[course.id] || null,
  };
}

function normalizeCourse(c) {
  const enr = (c.enrollments || []).find((e) => /student/i.test(e.type));
  const grades = enr?.grades || {};
  const rawScore = enr?.computed_current_score ?? grades.current_score ?? enr?.computed_final_score ?? null;
  const currentLetter = enr?.computed_current_grade ?? grades.current_grade ?? null;
  const hasGrade = rawScore != null && !(rawScore === 0 && !currentLetter);
  const type = courseTypeFor(c);
  const targetGrade = settings().targets[type] ?? settings().targets.regular;
  return {
    id: c.id,
    name: c.name,
    code: c.code || c.course_code || null,
    currentScore: hasGrade ? rawScore : null,
    currentGrade: enr?.computed_current_grade ?? grades.current_grade ?? null,
    finalScore: enr?.computed_final_score ?? null,
    finalGrade: enr?.computed_final_grade ?? null,
    totalStudents: c.total_students,
    type,
    targetGrade,
    isPublished: c.workflow_state === "available",
    term: c.term?.name || null,
  };
}

async function fetchGroups(courseId) {
  return canvas.getAssignmentGroups(courseId);
}

async function mapWithConcurrency(items, fn, size = 6) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

export async function loadAll(onStage) {
  const label = onStage || (() => {});
  label("Fetching profile…");
  const profile = await canvas.getProfile();

  label("Fetching courses…");
  const courseRaw = await canvas.getCourses();
  const courses = courseRaw
    .filter((c) => c.enrollments?.some((e) => /student/i.test(e.type)))
    .map(normalizeCourse)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  label("Fetching assignments…");
  const groupSets = await mapWithConcurrency(courses, async (c) => {
    try { return await fetchGroups(c.id); }
    catch (e) { console.warn(`Assignment fetch failed for ${c.name}`, e); return []; }
  });
  const courseGroups = new Map();
  courses.forEach((c, i) => courseGroups.set(c.id, groupSets[i]));

  label("Fetching to-do list…");
  let todos = [];
  try { todos = await canvas.getTodos(); } catch (e) { console.warn("Todo fetch failed", e); }

  const tasks = [];
  const groupWeightOf = (courseId, groupId) => {
    const group = courseGroups.get(courseId)?.find((g) => g.id === groupId);
    return group?.group_weight ?? null;
  };

  for (const c of courses) {
    for (const g of courseGroups.get(c.id) || []) {
      const weight = g.group_weight ?? groupWeightOf(c.id, g.id);
      for (const a of g.assignments || []) {
        tasks.push(normalizeAssignment({ ...c, groupWeightSource: weight }, { ...g, group_weight: weight }, a));
      }
    }
  }

  const dedupeTodos = [];
  const seenIds = new Set();
  for (const t of todos) {
    const a = t.assignment;
    if (!a) continue;
    const key = `${t.course_id}-${a.id}`;
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    const course = courses.find((c) => c.id === t.course_id) || {
      id: t.course_id, name: t.context_name || "Unknown", code: null,
    };
    const groupWeight = null;
    const task = normalizeAssignment(
      { ...course, groupWeightSource: groupWeight },
      { id: null, name: null, group_weight: null },
      { ...a, course_id: t.course_id },
    );
    task.fromTodo = true;
    dedupeTodos.push(task);
  }

  // Merge authoritative submission scores so graded work always shows its grade,
  // even if the assignment-groups include was scope-limited or empty.
  // grouped=1 returns { assignments: [], submissions: [{ assignment_id, score, workflow_state }] }.
  // Results are cached per course (10 min) so repeated refreshes stay fast.
  const SUB_CACHE_TTL = 10 * 60 * 1000;
  const getSubsCached = async (c) => {
    const key = `subs:${c.id}`;
    const cached = cacheGet(key, null);
    if (cached && Date.now() - cached.at < SUB_CACHE_TTL) return cached.data;
    try {
      const data = await canvas.getStudentSubmissions(c.id);
      if (data && (data.submissions || []).length) cacheSet(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      if (cached) return cached.data;
      console.warn("Submission fetch failed for " + c.name, e);
      throw e;
    }
  };

  await mapWithConcurrency(courses, async (c) => {
    let res;
    try {
      res = await getSubsCached(c);
    } catch { return; }
    const byAid = new Map((res?.submissions || []).map((s) => [s.assignment_id, s]));
    for (const t of tasks) {
      if (t.courseId !== c.id || !t.canvasId) continue;
      const sub = byAid.get(t.canvasId);
      if (!sub) continue;
      if (sub.score != null) t.pointsEarned = sub.score;
      if (sub.workflow_state) {
        t.submitted = sub.workflow_state === "submitted" || sub.workflow_state === "graded" || !!sub.graded_at;
        t.needsGrading = sub.workflow_state === "pending_review" || (sub.workflow_state === "submitted" && sub.score == null);
      }
    }
  });

  // Re-merge locally-added assignments so they survive refreshes.
  for (const t of localTasks()) {
    const course = courses.find((c) => c.id === t.courseId);
    if (course) t.courseName = t.courseName || course.name;
    t.isLocal = true;
    if (!tasks.some((x) => x.id === t.id)) tasks.push(t);
  }

  return { courses, tasks, todos: dedupeTodos, profile };
}