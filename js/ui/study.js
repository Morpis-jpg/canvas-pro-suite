import { esc, toast } from "../utils.js";
import { generateSchedule, scheduleSummary, courseFactors, windowRange } from "../schedule.js";
import { settings, saveSettings, doneIds, timeLogs } from "../storage.js";

export function render(state, root) {
  const { courses, tasks, todos } = state.data;
  const done = new Set(doneIds());
  const merged = [...tasks, ...todos.filter((t) => !tasks.some((x) => x.id === t.id))];
  const open = merged.filter((t) => !t.submitted && !done.has(t.id) && t.dueAt);
  const s = settings();
  const factors = courseFactors(merged);
  const logs = timeLogs();

  const sched = generateSchedule(courses, open);
  const sum = scheduleSummary(sched.days);
  const s0 = s.studySlots[0] || { start: "18:00", end: "21:00", label: "Evening" };
  const win = windowRange(s0);
  const winNote = win.mins === 0
    ? "Start and end are the same, so the plan has no room to place anything. Pick an end time after the start."
    : win.endM > 1440
      ? "Ends after midnight — the window runs into the next day's early hours."
      : "";

  const dayCards = sched.days.map((d) => `
    <div class="card day-card">
      <div class="flex between">
        <h3>${d.label}</h3>
        <span class="muted small">${d.used || 0} / ${d.available} min planned</span>
      </div>
      ${d.slots.length ? d.slots.map((sl) => {
        const loggedMins = logs[sl.taskId]?.mins;
        return `
        <div class="slot ${sl.kind === "break" ? "break" : ""}">
          <span class="time">${sl.start}</span>
          <div class="what"><div>${esc(sl.what)}</div><div class="small muted">${esc(sl.labels)}${loggedMins ? ` · spent ${loggedMins}m` : ""}</div></div>
          <span class="mins">${sl.mins}m</span>
        </div>`;
      }).join("") : `<p class="muted small">Free / flex time. Add an exam-adjacent day to trigger test prep.</p>`}
    </div>`).join("");

  const courseDifficulty = courses.map((c) => {
    const f = factors[c.id];
    return `
    <div class="row">
      <span class="small muted" style="flex:1">${esc(c.name)}${f ? `<div class="small">adapted ${f.factor.toFixed(2)}× · ${f.n} ${f.n === 1 ? "log" : "logs"}</div>` : ""}</span>
      <select class="course-diff" data-course="${c.id}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)">
        <option value="" ${!s.difficultyOverrides?.[c.id] ? "selected" : ""}>Default</option>
        <option value="0.6" ${s.difficultyOverrides?.[c.id]?.factor === 0.6 ? "selected" : ""}>Light</option>
        <option value="1" ${s.difficultyOverrides?.[c.id]?.factor === 1 ? "selected" : ""}>Normal</option>
        <option value="1.6" ${s.difficultyOverrides?.[c.id]?.factor === 1.6 ? "selected" : ""}>Heavy</option>
        <option value="2.2" ${s.difficultyOverrides?.[c.id]?.factor === 2.2 ? "selected" : ""}>Brutal</option>
      </select>
    </div>`;
  }).join("");

  root.innerHTML = `
    <h1>Study Plan</h1>
    <p class="subtitle">Homework is slotted the day before it's due; test prep ramps up over the 3 days leading up to an exam and never lands on test day. Time scales with points, weight, and difficulty.</p>

    <div class="grid grid-3 mt">
      <div class="card"><div class="small muted">Planned this week</div><div class="stat"><b>${Math.round(sum.totalMins / 60 * 10) / 10} h</b></div></div>
      <div class="card"><div class="small muted">Test prep sessions</div><div class="stat"><b>${sum.studySessions}</b></div></div>
      <div class="card"><div class="small muted">Daily cap</div><div class="stat"><b>${s.maxStudyMinutesPerDay} min</b></div></div>
    </div>

    <div class="grid grid-2 mt">
      <div>${dayCards}</div>
      <div>
        <div class="card">
          <h2>Tune it</h2>
          <div class="flex between" style="margin-bottom:8px">
            <span class="small muted">Study window</span>
            <span class="flex">
              <input id="winStart" type="time" value="${s0.start}" style="padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
              <span class="muted">–</span>
              <input id="winEnd" type="time" value="${s0.end}" style="padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
            </span>
          </div>
          ${winNote ? `<p class="small muted" style="margin:-2px 0 8px">${esc(winNote)}</p>` : ""}
          <label class="row" style="margin-bottom:6px">
            <span class="small muted" style="flex:1">Daily max (min)</span>
            <input id="dailyMax" type="number" min="30" max="600" step="15" value="${s.maxStudyMinutesPerDay}" style="width:90px;padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
          </label>
          <label class="row" style="margin-bottom:12px">
            <span class="small muted" style="flex:1">Minutes per point <b id="mppVal">${s.baseMinutesPerPoint}</b></span>
            <input id="mpp" type="range" min="0.3" max="3" step="0.1" value="${s.baseMinutesPerPoint}" style="flex:1;accent-color:var(--accent)" />
          </label>
          <div class="flex" style="gap:10px;margin-bottom:12px">
            <label class="col" style="flex:1">
              <span class="small muted">Break every (min)</span>
              <input id="breakEvery" type="number" min="0" max="120" step="5" value="${s.breakEveryMinutes}" style="width:100%;padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
            </label>
            <label class="col" style="flex:1">
              <span class="small muted">Break length (min) · 0 = off</span>
              <input id="breakLen" type="number" min="0" max="60" step="5" value="${s.breakMinutes}" style="width:100%;padding:6px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
            </label>
          </div>
          <button id="saveStudy" class="btn btn-primary">Save &amp; regenerate</button>
        </div>

        <div class="card mt">
          <h2>Class difficulty</h2>
          <p class="small muted">Tells the plan how long to budget per class. Applies to all the work in that class.</p>
          <div class="allocation mt">${courseDifficulty}</div>
        </div>
      </div>
    </div>
  `;

  root.querySelector("#saveStudy").addEventListener("click", () => {
    const st = settings();
    const slot = { start: root.querySelector("#winStart").value, end: root.querySelector("#winEnd").value, label: "Evening" };
    st.studySlots = [slot];
    st.maxStudyMinutesPerDay = +root.querySelector("#dailyMax").value;
    st.baseMinutesPerPoint = +root.querySelector("#mpp").value;
    st.breakEveryMinutes = +root.querySelector("#breakEvery").value;
    st.breakMinutes = +root.querySelector("#breakLen").value;
    saveSettings();
    const r = windowRange(slot);
    if (r.mins === 0) toast("Study window is zero-length — pick an end time after the start.", "err");
    else if (r.endM > 1440) toast("Saved — the study window runs past midnight.", "ok");
    else toast("Study plan updated.", "ok");
    render(state, root);
  });

  root.querySelector("#mpp").addEventListener("input", (e) => {
    root.querySelector("#mppVal").textContent = e.target.value;
  });

  root.querySelectorAll(".course-diff").forEach((sel) => {
    sel.addEventListener("change", () => {
      const st = settings();
      st.difficultyOverrides = st.difficultyOverrides || {};
      if (sel.value) st.difficultyOverrides[sel.dataset.course] = { factor: +sel.value };
      else delete st.difficultyOverrides[sel.dataset.course];
      saveSettings();
    });
  });
}