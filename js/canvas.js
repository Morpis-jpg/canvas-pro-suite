const PER_PAGE = 100;

// When true, API calls go through the local server's /api/canvas proxy so the
// browser never hits Canvas CORS and the token never leaves the machine.
// Set USE_PROXY=false (and give a public CORS-enabled base) when deploying.
const USE_PROXY = true;
const PROXY_PATH = "api/canvas";

let base = "";
let token = "";

function buildRequest(path, { method = "GET", body } = {}) {
  const suffix = (path.includes("?") ? "&" : "?") + `per_page=${PER_PAGE}`;
  const headers = {};
  let url;
  if (USE_PROXY) {
    url = PROXY_PATH + "?p=" + encodeURIComponent(path + suffix);
    headers["X-Canvas-Token"] = token || headers.Authorization;
    headers["X-Canvas-Base"] = base;
  } else {
    url = base + path + suffix;
    headers["Authorization"] = "Bearer " + token;
  }
  if (body) headers["Content-Type"] = "application/json";
  return { url, headers, body };
}

function errorFrom(res, status) {
  let msg = `Canvas error ${status}`;
  if (USE_PROXY && (status === 400 || status === 502 || status === 504)) {
    return msg + " (proxy issue — is the Node/python server running?)";
  }
  return msg;
}

async function parseJson(res) {
  const text = await res.text();
  if (!text) return null; // 204 No Content etc.
  try { return JSON.parse(text); } catch { return text; }
}

export function client(url, tok) {
  base = url.replace(/\/$/, "");
  token = tok;
  return api;
}

async function api(path, { method = "GET", body } = {}) {
  if (!base || !token) throw new Error("Canvas client not initialized.");
  const { url, headers } = buildRequest(path, { method, body });
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = errorFrom(res, res.status);
    try {
      const j = await parseJson(res);
      if (typeof j === "object") msg = j.errors?.[0]?.message || j.message || JSON.stringify(j);
    } catch {}
    if (res.status === 401) throw new Error("401 — Token rejected. Regenerate it in Canvas settings.");
    throw new Error(msg);
  }
  return parseJson(res);
}

// Follows pagination and returns every element.
async function all(path, init) {
  let out = [];
  let url;
  let headers;
  {
    const r = buildRequest(path, init);
    url = r.url;
    headers = r.headers;
  }
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      let msg = errorFrom(res, res.status);
      try {
        const j = await res.json();
        if (typeof j === "object") msg = j.errors?.[0]?.message || j.message || JSON.stringify(j);
      } catch {}
      throw new Error(msg);
    }
    const data = await parseJson(res);
    out = out.concat(Array.isArray(data) ? data : data ? [data] : []);
    const link = res.headers.get("Link") || "";
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = m ? m[1] : null;
  }
  return out;
}

export function getProfile() {
  return api("/api/v1/users/self/profile");
}

export function getCourses() {
  return all("/api/v1/courses?enrollment_state=active&include[]=total_scores");
}

export function getAssignmentGroups(courseId) {
  return all(`/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&assignment[]=submission&override_assignment_dates=false`);
}

// All of the current user's submissions for a course — the canonical source of
// "did I get a grade" that works even when the group include is scope-limited.
// grouped=1 returns { assignments: [], submissions: [{ assignment_id, score, workflow_state }] }.
// Pages through every result so a large course never misses grades.
export async function getStudentSubmissions(courseId) {
  const out = { assignments: [], submissions: [] };
  let path = `/api/v1/courses/${courseId}/students/submissions?student_ids[]=self&grouped=1`;
  while (path) {
    const r = buildRequest(path);
    const res = await fetch(r.url, { headers: r.headers });
    if (!res.ok) {
      let msg = errorFrom(res, res.status);
      try {
        const j = await res.json();
        if (typeof j === "object") msg = j.errors?.[0]?.message || j.message || JSON.stringify(j);
      } catch {}
      throw new Error(msg);
    }
    const data = await parseJson(res);
    if (data) {
      out.assignments = out.assignments.concat(data.assignments || []);
      out.submissions = out.submissions.concat(data.submissions || []);
    }
    const link = res.headers.get("Link") || "";
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    path = m ? m[1] : null;
  }
  return out;
}

// Generic write helper for the canvas proxy (submit work, upload preflight…).
export function post(path, body) {
  return api(path, { method: "POST", body });
}

export function getTodos() {
  return api("/api/v1/users/self/todo?include[]=course");
}

export function getAssignment(courseId, assignmentId) {
  return api(`/api/v1/courses/${courseId}/assignments/${assignmentId}`);
}

export function getCourseFiles(courseId) {
  return all(`/api/v1/courses/${courseId}/files?sort=updated_at&order=desc`);
}

export function fileDownloadUrl(base, courseId, fileId) {
  return `${base.replace(/\/$/, "")}/api/v1/courses/${courseId}/files/${fileId}/download?download_frd=1`;
}

export function getFile(courseId, fileId) {
  return api(`/api/v1/courses/${courseId}/files/${fileId}`);
}

// CanvaDoc preview session — the same mechanism Canvas's own file preview
// uses. Works for PDF/office/images and rides on the file-read access the
// listing already has (no extra download scope needed).
export async function getCanvadocSession(relPath) {
  const r = await api(relPath);
  const su = (r && (r.session_url || r.url)) || r;
  return typeof su === "string" && /^https?:\/\//.test(su) ? su : null;
}

export function getAnnouncements(contextCodes, cutoffDays = 60) {
  const start = new Date(Date.now() - cutoffDays * 864e5).toISOString();
  return all(`/api/v1/announcements?${contextCodes.map((c) => "context_codes[]=" + encodeURIComponent(c)).join("&")}&start_date=${encodeURIComponent(start)}`);
}

export function markAnnouncementRead(courseId, topicId) {
  return api(`/api/v1/courses/${courseId}/discussion_topics/${topicId}/read`, { method: "PUT" });
}

// Handouts are often posted as Modules ("File") items instead of Files.
// Module items usually stay readable for students even when the Files API
// is scope-locked, so this is the Documents fallback.
export async function getModuleFiles(courseId) {
  const modules = await all(`/api/v1/courses/${courseId}/modules?include[]=items&include[]=content_details`);
  const items = [];
  for (const m of modules) {
    for (const it of m.items || []) {
      if (it && it.type === "File") items.push({ ...it, module_id: m.id });
    }
  }
  const out = [];
  await Promise.all(items.map(async (it) => {
    try {
      let d = it;
      if (!d.url || !d.content_details) {
        d = await api(`/api/v1/courses/${courseId}/modules/${it.module_id}/items/${it.id}?include[]=content_details`);
      }
      const det = d.content_details || {};
      if (d.url) {
        out.push({
          id: String(d.content_id || d.id),
          display_name: d.title || it.title,
          filename: d.title || it.title,
          content_type: det.content_type,
          size: det.size,
          updated_at: det.updated_at,
          url: d.url,
          locked: !!det.locked,
        });
      }
    } catch (e) {}
  }));
  return out;
}