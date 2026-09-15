import { esc, fmtDate, daysUntil, toast } from "../utils.js";
import * as canvas from "../canvas.js";
import { rawEstimate } from "../schedule.js";
import { timeLogs, logTime, removeLocalTask } from "../storage.js";
import { openSubmissionModal } from "./submissionModal.js";

let open = false;

function sanitize(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "");
}

export async function openTask(task, state) {
  if (open) return;
  open = true;

  const due = daysUntil(task.dueAt);
  const wrap = document.createElement("div");
  wrap.className = "modal-overlay hidden";
  wrap.innerHTML = `
    <div class="modal modal-wide">
      <div class="modal-head">
        <h2>${esc(task.title)}</h2>
        <button class="btn btn-small btn-ghost" data-close>✕</button>
      </div>
      <div class="meta">
        <div class="small muted">${esc(task.courseName || "")}${task.groupName ? ` · ${esc(task.groupName)}` : ""}${task.groupWeight != null ? ` · ${task.groupWeight}%` : ""}</div>
        <div class="small muted">Due ${fmtDate(task.dueAt)}${due != null ? ` · ${due < 0 ? Math.abs(due) + "d overdue" : due === 0 ? "today" : "in " + due + "d"}` : ""}</div>
        <div class="small muted">${task.pointsPossible ? task.pointsPossible + " pts" : ""}${task.baseMinutes ? ` · ~${task.baseMinutes} min` : ""}</div>
      </div>
      <div class="status-row">
        <span class="tag ${task.type === "exam" ? "tag-red" : task.type === "quiz" ? "tag-yellow" : task.type === "project" ? "tag-purple" : "tag-blue"}">${esc(task.type)}</span>
        <span class="tag ${task.submitted ? "tag-green" : "tag-yellow"}">${task.submitted ? "Submitted" : "Not submitted"}</span>
      </div>
      ${!task.submitted && task.canvasId ? `<button class="btn btn-primary submit-btn" data-submit>Submit Assignment</button>` : ""}
      ${task.isLocal ? `<button class="btn btn-ghost btn-small" data-dellocal>Delete this local assignment</button>` : ""}
      <div class="effort">
        <div class="flex between" style="align-items:baseline">
          <span class="small muted">Effort tracker · actually been studying it?</span>
          <span class="small muted" id="effortState"></span>
        </div>
        <div class="flex" style="gap:8px;margin-top:6px">
          <input id="effortMins" type="number" min="1" max="600" placeholder="Minutes spent…" style="flex:1;max-width:180px;padding:8px 11px;border-radius:9px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)" />
          <button id="effortLog" class="btn btn-small">Log effort</button>
        </div>
      </div>
      <div class="desc">${task.description ? sanitize(task.description) : "<p class='muted'>Loading description…</p>"}</div>
      <div class="modal-foot">
        ${task.htmlUrl ? `<a class="btn" href="${esc(task.htmlUrl)}" target="_blank" rel="noopener">Open on Canvas ↗</a>` : ""}
      </div>
    </div>`;

  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.remove("hidden"));

  const close = () => {
    wrap.classList.add("hidden");
    setTimeout(() => wrap.remove(), 200);
    document.removeEventListener("keydown", onKey);
    open = false;
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);

  const estimate = rawEstimate(task);
  const stateEl = wrap.querySelector("#effortState");
  const minsIn = wrap.querySelector("#effortMins");
  const logBtn = wrap.querySelector("#effortLog");
  const logged = timeLogs()[task.id];

  function paintEffort() {
    const cur = timeLogs()[task.id];
    if (cur) stateEl.textContent = `Logged ${cur.mins} min (${cur.count}×) · estimate ${estimate} min`;
    else stateEl.textContent = `Estimate: ~${estimate} min for this`;
  }
  paintEffort();

  logBtn.addEventListener("click", () => {
    const m = minsIn.value;
    if (!m || +m <= 0) { toast("Enter minutes first.", ""); return; }
    logTime(task.id, +m, estimate);
    toast(`Logged ${m} min — ${task.courseName} will adapt to this.`, "ok");
    minsIn.value = "";
    paintEffort();
  });

  if (task.canvasId && task.courseId && !task.description) {
    try {
      const detail = await canvas.getAssignment(task.courseId, task.canvasId);
      const desc = sanitize(detail.description);
      const box = wrap.querySelector(".desc");
      if (box) {
        box.innerHTML = desc || "<p class='muted'>No description on Canvas.</p>";
        box.classList.add("loaded");
      }
    } catch {
      const box = wrap.querySelector(".desc");
      if (box) box.innerHTML = "<p class='muted'>Could not load the description (offline or token issue).</p>";
    }
  }

  // Submit button handler
  const submitBtn = wrap.querySelector("[data-submit]");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => openSubmissionModal(task, state, close));
  }

  // Local assignments can be deleted since they're only stored on this device.
  const delLocal = wrap.querySelector("[data-dellocal]");
  if (delLocal) {
    delLocal.addEventListener("click", () => {
      if (!confirm(`Delete “${task.title}” from this device? (Canvas is untouched.)`)) return;
      removeLocalTask(task.id);
      const i = (state?.data?.tasks || []).findIndex((t) => t.id === task.id);
      if (i >= 0) state.data.tasks.splice(i, 1);
      close();
      const active = document.querySelector(".sidebar .tab-btn.active");
      if (active) active.click();
      toast("Local assignment deleted.", "ok");
    });
  }
}