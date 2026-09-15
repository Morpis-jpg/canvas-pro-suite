import { esc, toast, fmtDate, daysUntil } from "../utils.js";
import * as canvas from "../canvas.js";
import { rawEstimate } from "../schedule.js";
import { timeLogs, logTime } from "../storage.js";

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
      ${!task.submitted ? `<button class="btn btn-primary submit-btn" data-submit>Submit Assignment</button>` : ""}
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
}

// Canvas submission types
const SUBMISSION_TYPES = [
  { id: "online_text_entry", label: "Text Entry", icon: "📝", description: "Type or paste your response directly" },
  { id: "online_url", label: "Website URL", icon: "🔗", description: "Submit a link (Google Docs, GitHub, etc.)" },
  { id: "online_upload", label: "File Upload", icon: "📎", description: "Upload files from your computer" },
  { id: "media_recording", label: "Media Recording", icon: "🎥", description: "Record audio/video or upload media" },
  { id: "student_annotation", label: "Student Annotation", icon: "🖊️", description: "Annotate a document provided by your teacher" },
];

export function openSubmissionModal(task, state, onClose) {
  // Only show submission methods the assignment actually accepts. Fall back to
  // showing all when Canvas didn't tell us (todo-feed / local tasks).
  const allowed = Array.isArray(task.submissionTypes) && task.submissionTypes.length
    ? task.submissionTypes
    : SUBMISSION_TYPES.map((t) => t.id);
  const tabs = SUBMISSION_TYPES.filter((t) => allowed.includes(t.id));
  const blocked = Array.isArray(task.submissionTypes) && task.submissionTypes.length
    ? task.submissionTypes.filter((t) => /external_tool|discussion_topic|wiki_page|basic_lti_launch/i.test(t))
    : [];
  const canSubmit = tabs.length > 0;

  const wrap = document.createElement("div");
  wrap.className = "modal-overlay";
  wrap.innerHTML = `
    <div class="modal modal-wide">
      <div class="modal-head">
        <h2>Submit: ${esc(task.title)}</h2>
        <button class="btn btn-small btn-ghost" data-close>✕</button>
      </div>
      ${canSubmit ? `
      <div class="submission-tabs" role="tablist">
        ${tabs.map((t, i) => `
          <button class="sub-tab ${i === 0 ? "active" : ""}" role="tab" aria-selected="${i === 0}" data-type="${t.id}">${t.icon} ${t.label}</button>
        `).join("")}
      </div>
      <div class="submission-panels">
        ${tabs.map((t, i) => `
          <div class="sub-panel ${i === 0 ? "" : "hidden"}" role="tabpanel" data-type="${t.id}">
            ${renderSubmissionPanel(t, task)}
          </div>
        `).join("")}
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="doSubmit" disabled>Submit Assignment</button>
      </div>` : `
      <div class="submission-unavailable">
        <p>This assignment isn't using Canvas's online submission — it expects something else${blocked.length ? " (" + esc(blocked.join(", ")) + ")" : ""}.</p>
        ${task.htmlUrl ? `<a class="btn" href="${esc(task.htmlUrl)}" target="_blank" rel="noopener">Open on Canvas ↗</a>` : ""}
        <button class="btn btn-ghost" data-close>Close</button>
      </div>`}
    </div>
  `;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.remove("hidden"));

  if (!canSubmit) {
    wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    return;
  }

  const close = () => { wrap.classList.add("hidden"); setTimeout(() => wrap.remove(), 200); };
  wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });

  // Tab switching
  wrap.querySelectorAll(".sub-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const type = tab.dataset.type;
      wrap.querySelectorAll(".sub-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.type === type);
        t.setAttribute("aria-selected", t.dataset.type === type);
      });
      wrap.querySelectorAll(".sub-panel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.type !== type);
      });
      updateSubmitButton(wrap, type);
    });
  });

  // File upload handling
  wrap.querySelectorAll('input[type="file"]').forEach((input) => {
    input.addEventListener("change", () => updateSubmitButton(wrap, wrap.querySelector(".sub-tab.active").dataset.type));
  });

  // Text/URL input handling
  wrap.querySelectorAll('textarea, input[type="url"]').forEach((input) => {
    input.addEventListener("input", () => updateSubmitButton(wrap, wrap.querySelector(".sub-tab.active").dataset.type));
  });

  // Submit handler
  wrap.querySelector("#doSubmit").addEventListener("click", async () => {
    const activeType = wrap.querySelector(".sub-tab.active").dataset.type;
    const success = await submitAssignment(task, state, activeType, wrap);
    if (success) {
      close();
      if (onClose) onClose();
      toast("Assignment submitted successfully!", "ok");
      // Refresh the course detail if open
      const root = document.getElementById("mainContent");
      const courseId = task.courseId;
      if (state.ui?.courseDetailId === courseId) {
        const { render: renderCourseDetail } = await import("./courseDetail.js");
        renderCourseDetail(state, root, () => false);
      }
    }
  });
}

function renderSubmissionPanel(type, task) {
  switch (type.id) {
    case "online_text_entry":
      return `
        <div class="sub-panel-content">
          <p class="muted">${type.description}</p>
          <textarea name="text_entry" rows="10" placeholder="Type your response here…" style="width:100%;min-height:200px;padding:12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);font-family:inherit;font-size:14px;resize:vertical"></textarea>
          <p class="small muted mt">Tip: You can use Markdown formatting.</p>
        </div>
      `;
    case "online_url":
      return `
        <div class="sub-panel-content">
          <p class="muted">${type.description}</p>
          <div class="form-row"><label>URL <input type="url" name="url" placeholder="https://docs.google.com/... or https://github.com/..." required></label></div>
          <p class="small muted mt">Paste a link to your Google Doc, GitHub repo, Figma file, or any website.</p>
        </div>
      `;
    case "online_upload":
      return `
        <div class="sub-panel-content">
          <p class="muted">${type.description}</p>
          <div class="drop-zone" id="dropZone">
            <div class="drop-icon">📎</div>
            <div class="drop-text">Drag & drop files here, or click to browse</div>
            <div class="drop-hint">Max 500MB per file · Multiple files allowed</div>
            <input type="file" name="files" multiple hidden accept="*">
          </div>
          <div class="file-list" id="fileList"></div>
        </div>
      `;
    case "media_recording":
      return `
        <div class="sub-panel-content">
          <p class="muted">${type.description}</p>
          <div class="media-options">
            <button type="button" class="media-btn" data-action="record-audio">
              <span class="media-icon">🎤</span>
              <div><strong>Record Audio</strong><span>Use your microphone</span></div>
            </button>
            <button type="button" class="media-btn" data-action="record-video">
              <span class="media-icon">📹</span>
              <div><strong>Record Video</strong><span>Use your camera</span></div>
            </button>
            <button type="button" class="media-btn" data-action="upload-media">
              <span class="media-icon">📁</span>
              <div><strong>Upload Media</strong><span>Select audio/video file</span></div>
            </button>
          </div>
          <div class="media-preview" id="mediaPreview"></div>
        </div>
      `;
    case "student_annotation":
      return `
        <div class="sub-panel-content">
          <p class="muted">${type.description}</p>
          <div class="annotation-notice">
            <p>Your teacher must attach a document for you to annotate. If no document is available, this option won't be available.</p>
            <button type="button" class="btn btn-ghost btn-small" id="checkAnnotation">Check for Annotatable Document</button>
          </div>
        </div>
      `;
    default:
      return `<p class="muted">Submission type not supported yet.</p>`;
  }
}

function updateSubmitButton(wrap, type) {
  const btn = wrap.querySelector("#doSubmit");
  let valid = false;

  switch (type) {
    case "online_text_entry":
      valid = wrap.querySelector('textarea[name="text_entry"]').value.trim().length > 0;
      break;
    case "online_url":
      valid = wrap.querySelector('input[name="url"]').value.trim().length > 0;
      break;
    case "online_upload":
      valid = wrap.querySelectorAll('.file-list .file-item').length > 0;
      break;
    case "media_recording":
      valid = wrap.querySelector('#mediaPreview').children.length > 0;
      break;
    case "student_annotation":
      valid = wrap.querySelector('#annotationReady')?.checked || false;
      break;
  }

  btn.disabled = !valid;
  btn.textContent = valid ? "Submit Assignment" : "Complete the form to submit";
}

async function submitAssignment(task, state, type, wrap) {
  const cid = task.courseId;

  try {
    if (!task.canvasId) {
      toast("This is a local task — submit online, or open the Canvas version to submit here.", "err");
      return false;
    }

    if (type === "online_text_entry") {
      const text = wrap.querySelector('textarea[name="text_entry"]').value;
      await submitToCanvas({ submission_type: "online_text_entry", body: text });
    } else if (type === "online_url") {
      const url = wrap.querySelector('input[name="url"]').value;
      await submitToCanvas({ submission_type: "online_url", url });
    } else if (type === "online_upload") {
      const files = wrap.querySelector('input[name="files"]').files;
      if (!files.length) return false;
      const fileIds = [];
      for (const file of files) {
        const id = await uploadFile(cid, file);
        if (id) fileIds.push(id);
      }
      if (!fileIds.length) throw new Error("No files uploaded.");
      await submitToCanvas({ submission_type: "online_upload", file_ids: fileIds });
    } else if (type === "media_recording") {
      // Recorded media is submitted as a regular file upload (Canvas's native
      // media submission needs a Kaltura session, so files cover the practical case).
      const preview = wrap.querySelector('#mediaPreview');
      const mediaFile = preview.dataset.mediaFile;
      if (!mediaFile) return false;
      const id = await uploadFile(cid, mediaFile);
      if (!id) throw new Error("Media upload failed.");
      await submitToCanvas({ submission_type: "online_upload", file_ids: [id] });
    } else if (type === "student_annotation") {
      toast("Student annotation requires a teacher-provided document.", "err");
      return false;
    }

    // Mark locally as submitted
    task.submitted = true;
    task.needsGrading = true;
    return true;
  } catch (e) {
    toast("Submission failed: " + e.message, "err");
    return false;
  }

  // Both writes go through the local /api/canvas proxy — the browser never
  // talks to Canvas directly, so there is no CORS block and the token stays on
  // this machine.
  async function submitToCanvas(data) {
    return canvas.post(`/api/v1/courses/${cid}/assignments/${task.canvasId}/submissions`, { submission: data });
  }

  async function uploadFile(courseId, file) {
    // 1) Preflight: get the signed upload_url + params via the proxy.
    const pre = await canvas.post(`/api/v1/courses/${courseId}/files`, {
      name: file.name,
      size: file.size,
      content_type: file.type || "application/octet-stream",
      on_duplicate: "rename",
      parent_folder_path: "/",
    });
    const uploadUrl = pre.upload_url;
    if (!uploadUrl) throw new Error("No upload URL returned.");
    // 2) POST the multipart body (params + file) — the local server relays it
    //    to Canvas so cross-origin rules don't apply.
    const formData = new FormData();
    Object.entries(pre.upload_params || {}).forEach(([k, v]) => formData.append(k, v));
    formData.append("file", file);
    const up = await fetch("api/ul?u=" + encodeURIComponent(uploadUrl), { method: "POST", body: formData });
    if (!up.ok) {
      const err = (await up.text().catch(() => "")) || `HTTP ${up.status}`;
      throw new Error("File upload failed: " + err.slice(0, 140));
    }
    const upJson = await up.json().catch(() => ({}));
    return upJson.id || pre.id;
  }
}

// Drop zone handling
document.addEventListener("click", (e) => {
  const dropZone = e.target.closest("#dropZone");
  if (dropZone) dropZone.querySelector('input[type="file"]').click();
});

document.addEventListener("dragover", (e) => {
  const dropZone = e.target.closest("#dropZone");
  if (dropZone) { e.preventDefault(); dropZone.classList.add("dragover"); }
});

document.addEventListener("dragleave", (e) => {
  const dropZone = e.target.closest("#dropZone");
  if (dropZone) dropZone.classList.remove("dragover");
});

document.addEventListener("drop", (e) => {
  const dropZone = e.target.closest("#dropZone");
  if (dropZone) {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files, dropZone);
  }
});

document.addEventListener("change", (e) => {
  if (e.target.matches('#dropZone input[type="file"]')) {
    const files = Array.from(e.target.files);
    handleFiles(files, e.target.closest("#dropZone"));
  }
});

function handleFiles(files, dropZone) {
  const list = dropZone.parentElement.querySelector("#fileList");
  files.forEach((file) => {
    if (file.size > 500 * 1024 * 1024) {
      toast(`${file.name} is too large (max 500MB)`, "err");
      return;
    }
    const item = document.createElement("div");
    item.className = "file-item";
    item.innerHTML = `
      <span class="file-icon">📄</span>
      <span class="file-name" title="${esc(file.name)}">${esc(file.name)}</span>
      <span class="file-size">(${formatBytes(file.size)})</span>
      <button type="button" class="file-remove" aria-label="Remove">✕</button>
    `;
    item.dataset.file = file;
    item.querySelector(".file-remove").addEventListener("click", () => { item.remove(); updateSubmitButton(dropZone.closest(".modal-overlay"), "online_upload"); });
    list.appendChild(item);
  });
  updateSubmitButton(dropZone.closest(".modal-overlay"), "online_upload");
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Media recording (simplified - would need MediaRecorder API in real implementation)
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".media-btn");
  if (!btn) return;
  const action = btn.dataset.action;
  const preview = document.getElementById("mediaPreview");
  preview.innerHTML = `<p class="muted">Media recording would use MediaRecorder API. For now, use "Upload Media" to select a file.</p>`;
  if (action === "upload-media") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,video/*";
    input.onchange = () => {
      if (input.files[0]) {
        preview.dataset.mediaFile = input.files[0];
        preview.innerHTML = `<p class="muted">Selected: ${esc(input.files[0].name)}</p>`;
        updateSubmitButton(preview.closest(".modal-overlay"), "media_recording");
      }
    };
    input.click();
  }
});