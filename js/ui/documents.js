import { esc, toast, fmtDate } from "../utils.js";
import { settings } from "../storage.js";
import * as canvas from "../canvas.js";

function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function kindFor(f) {
  const ct = (f.content_type || "").toLowerCase();
  if (f.mime_class === "image" || ct.startsWith("image/")) return { icon: "🖼", tag: "Image", cls: "tag-purple" };
  if (f.mime_class === "audio") return { icon: "🎵", tag: "Audio", cls: "tag-blue" };
  if (f.mime_class === "video") return { icon: "🎬", tag: "Video", cls: "tag-blue" };
  if (ct.includes("pdf")) return { icon: "📕", tag: "PDF", cls: "tag-red" };
  if (ct.includes("word") || ct.includes("document") || /\b(docx?|odt)\b/.test(f.filename || "")) return { icon: "📘", tag: "Doc", cls: "tag-blue" };
  if (ct.includes("sheet") || ct.includes("excel") || /\b(xlsx?|ods|csv)\b/.test(f.filename || "")) return { icon: "📊", tag: "Sheet", cls: "tag-green" };
  if (ct.includes("presentation") || ct.includes("powerpoint") || /\b(pptx?|odp)\b/.test(f.filename || "")) return { icon: "📽", tag: "Slides", cls: "tag-yellow" };
  if (/\b(zip|gzip|rar)\b/.test(ct) || /\b(?:zip|rar|7z|tar|gz)\b/.test(f.filename || "")) return { icon: "🗜", tag: "Archive", cls: "tag-green" };
  if (ct.includes("text") || /\b(txt|md|rtf)\b/.test(f.filename || "")) return { icon: "📄", tag: "Text", cls: "tag-blue" };
  return { icon: "📁", tag: (ct.split("/")[1] || "File").toUpperCase(), cls: "tag-blue" };
}

function closePreview() {
  const ov = document.getElementById("filePreview");
  if (ov) ov.remove();
}

function previewType(ct) {
  if (/^image\//.test(ct)) return "image";
  if (/^audio\//.test(ct)) return "audio";
  if (/^video\//.test(ct)) return "video";
  if (ct.includes("pdf")) return "pdf";
  if (/^text\//.test(ct)) return "text";
  return null;
}

function previewBody(kind, obj, blob) {
  if (kind === "image") return `<img src="${obj}" alt="preview" style="max-width:100%;max-height:70vh;border-radius:12px" />`;
  if (kind === "audio") return `<audio controls src="${obj}" style="width:100%"></audio>`;
  if (kind === "video") return `<video controls src="${obj}" style="max-width:100%;max-height:70vh;border-radius:12px"></video>`;
  if (kind === "pdf") return `<iframe src="${obj}" style="width:100%;height:70vh;border:none;border-radius:12px;background:#fff" title="Preview"></iframe>`;
  if (kind === "text") return blob ? `<pre style="max-height:60vh;overflow:auto;background:var(--bg-soft);border:1px solid var(--border);border-radius:12px;padding:14px;font-size:13px;white-space:pre-wrap">${esc(blob)}</pre>` : "";
  return null;
}

async function openFile(f) {
  const s = settings();
  const base = s.canvasBaseUrl || "";
  const cid = f._courseId;
  const fid = f.id;
  const onCanvas = `${base}/courses/${cid}/files/${fid}?preview=1`;

  const show = (bodyHTML, foot) => {
    closePreview();
    const ov = document.createElement("div");
    ov.className = "modal-overlay";
    ov.id = "filePreview";
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <h2>${esc(f.display_name || f.filename || "File")}</h2>
            <div class="meta small muted">${esc(f._courseName || "")} · ${fmtSize(f.size)}${f.updated_at ? " · " + esc(f.updated_at.split("T")[0]) : ""}</div>
          </div>
          <div class="flex">
            <a class="icon-btn" href="${esc(onCanvas)}" target="_blank" rel="noopener" title="Open in Canvas">↗</a>
            <button class="icon-btn" id="prevClose" title="Close">✕</button>
          </div>
        </div>
        <div id="prevBody">${bodyHTML || `<div class="muted">This file can't be previewed.</div>`}</div>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ""}
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("#prevClose")) closePreview(); });
  };

  // 1) Preferred: CanvaDoc preview session (Canvas's own viewer, handles
  //    PDF + office docs + images, no download scope needed). Module-sourced
  //    files don't carry a session — pull the full file object to get one.
  let fileMeta = f;
  let canvasDocUrl = f.canvadoc_session_url;
  if (!canvasDocUrl && cid && fid) {
    try {
      const meta = await canvas.getFile(cid, fid);
      if (meta) fileMeta = { ...f, ...meta };
      if (fileMeta.canvadoc_session_url) canvasDocUrl = fileMeta.canvadoc_session_url;
    } catch (e) {}
  }
  if (canvasDocUrl) {
    try {
      const sessionUrl = await canvas.getCanvadocSession(canvasDocUrl);
      if (sessionUrl) {
        show(`<iframe src="${esc(sessionUrl)}" allowfullscreen style="width:100%;height:68vh;border:none;border-radius:12px;background:#fff"></iframe>
          <p class="small muted" style="margin-top:8px">Preview powered by CanvaDoc. If it looks blank, use the ↗ button to open it in Canvas.</p>`);
        return;
      }
    } catch (e) {}
  }

  // 2) Fallback: fetch bytes directly and render images/audio/video/PDF/text.
  let blob;
  try {
    const downloadTarget = fileMeta.url || f.url || canvas.fileDownloadUrl(base, cid, fid);
    const res = await fetch("/api/dl?u=" + encodeURIComponent(downloadTarget), {
      headers: { "X-Canvas-Token": s.token, "X-Canvas-Base": base },
    });
    if (!res.ok) {
      let msg = `Couldn't load file (${res.status})`;
      try { const j = await res.json(); msg = (j && j.message) || msg; } catch {}
      throw new Error(msg);
    }
    blob = await res.blob();
  } catch (e) {
    show(`<p class="error">${esc(e.message)}</p><p class="small muted">If this file has a #{preview} page in Canvas you can open it with the ↗ button above.</p>`,
      `<a class="btn" href="${esc(onCanvas)}" target="_blank" rel="noopener">Open in Canvas ↗</a>`);
    return;
  }

  const ct = blob.type || f.content_type || "";
  const kind = previewType(ct);
  const obj = URL.createObjectURL(blob);

  if (kind) {
    let text = null;
    if (kind === "text") text = await blob.text();
    show(previewBody(kind, obj, text));
  } else {
    show(`<p class="muted">"${esc(f.display_name || f.filename)}" is a ${esc(ct || f.mime_class || "file")} — this type isn't viewable in the in-app viewer.</p>`,
      `<a class="btn" href="${esc(onCanvas)}" target="_blank" rel="noopener">Open in Canvas ↗</a>`);
  }
}

function fileRow(f, idx) {
  const k = kindFor(f);
  const link = !f.locked && f.url;
  const name = link
    ? `<button class="doc-name doc-click" data-idx="${idx}" title="Preview">${esc(f.display_name || f.filename)}${f.locked ? " 🔒" : ""}</button>`
    : `<span class="doc-name muted">${esc(f.display_name || f.filename)}${f.locked ? " 🔒" : ""}</span>`;
  return `
    <tr>
      <td>${k.icon} ${name}</td>
      <td><span class="tag ${k.cls}">${k.tag}</span></td>
      <td class="small muted">${esc(f.size != null ? fmtSize(f.size) : "—")}</td>
      <td class="small muted">${f.updated_at ? fmtDate(f.updated_at.split("T")[0]) : "—"}</td>
      ${link ? `<td class="doc-open"><button class="doc-click btn btn-ghost btn-small" data-idx="${idx}">Preview</button></td>` : "<td></td>"}
    </tr>`;
}

async function collectFiles(courses, { files: getFiles, modules: getModules } = {}, progress) {
  return Promise.allSettled(courses.map(async (c) => {
    if (progress) progress.textContent = `Scanning ${c.name}…`;
    try {
      const files = await getFiles(c.id);
      return { course: c, source: "files", files: (files || []).filter((f) => f.display_name) };
    } catch {
      try {
        const files = await getModules(c.id);
        return { course: c, source: "modules", files };
      } catch (e) {
        return { course: c, source: "none", error: e };
      }
    }
  }));
}

export async function render(state, root, isStale = () => false) {
  root.innerHTML = `
    <h1>Documents</h1>
    <p class="subtitle">Uploads your teachers posted that aren't graded assignments — notes, handouts, slides, and study resources (from course Files, or File items in Modules).</p>
    <div id="docList"><div class="loading" style="padding:40px 0"><div class="spinner"></div><p id="docProgress" class="muted small">Loading files…</p></div></div>
  `;
  const list = root.querySelector("#docList");
  const progress = root.querySelector("#docProgress");

  const courses = state.data?.courses || [];
  if (!courses.length) {
    list.innerHTML = `<div class="card"><p class="muted">No courses to scan. Refresh data first.</p></div>`;
    return;
  }

  const results = await collectFiles(courses, {
    files: canvas.getCourseFiles,
    modules: canvas.getModuleFiles,
  }, (msg) => { progress.textContent = msg; });

  if (isStale()) return;

  const dedupe = (files) => {
    const seen = new Set();
    return files.filter((f) => {
      const k = f.url || f.display_name;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const groups = [];
  let failed = 0, fromModules = 0;
  const allFiles = [];
  results.forEach((r) => {
    const g = r.status === "fulfilled" ? r.value : { source: "none", error: r.reason };
    const files = dedupe(g.files || []).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    if (g.source === "none") { if (g.course) failed++; return; }
    if (!files.length) return;
    if (g.source === "modules") fromModules += files.length;
    const start = allFiles.length;
    allFiles.push(...files.map((f) => ({ ...f, _courseId: g.course.id, _courseName: g.course.name })));
    files.forEach((f, i) => { f._idx = start + i; });
    groups.push({ ...g, files, source: g.source });
  });
  const total = groups.reduce((n, g) => n + g.files.length, 0);

  if (!groups.length && failed === courses.length) {
    list.innerHTML = `
      <div class="card">
        <p class="error">Couldn't load files — "${
          esc(results[0].status === "fulfilled" ? results[0].value?.error?.message || "not authorized" : "Canvas error")
        }".</p>
        <div class="mt">
          <b class="small">Why this happens</b>
          <p class="small muted" style="margin-top:4px">The Files API needs a specific permission ("Files" scope) on your access token. Many student tokens aren't created with it, and some districts hide Files from students entirely.</p>
          <div class="small muted" style="margin-top:8px">
            <b>Fix it (1 minute, in Canvas):</b><br>
            1. Click your profile → <b>Settings</b> → bottom left <b>+ New Access Token</b>.<br>
            2. In the <b>Scopes</b> selector, search for and tick <b>Files</b> and <b>Modules</b> (or pick "REST API access" / the scope list shown by your admin).<br>
            3. Paste the new token back in <b>Settings → Canvas connection</b> here.
          </div>
          <p class="small muted" style="margin-top:8px">If your district hides the Files tab for students, the Documents tab also reads file items from Modules — that usually still works.</p>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = `
    <p class="small muted mb">${total} file${total === 1 ? "" : "s"} · newest first · click a file to preview it${fromModules ? ` · ${fromModules} from Modules` : ""}</p>
    ${groups.map((g) => `
      <div class="card">
        <div class="flex between" style="margin-bottom:6px">
          <h2 style="margin:0">${esc(g.course.name)}</h2>
          <div class="flex">
            ${g.source === "modules" ? `<span class="tag tag-purple">via Modules</span>` : ""}
            <span class="tag tag-blue">${g.files.length} file${g.files.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div class="table-wrap"><table>
          <tbody>${g.files.map((f) => fileRow(f, f._idx)).join("")}</tbody>
        </table></div>
      </div>`).join("")}
    ${failed ? `<p class="small muted">${failed} course${failed === 1 ? "" : "s"} skipped (no file or module access).</p>` : ""}
  `;

  list.querySelectorAll(".doc-click").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = allFiles[+btn.dataset.idx];
      if (f) openFile(f);
    });
  });
}
