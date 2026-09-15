import { esc, toast, fmtDate } from "../utils.js";
import { settings } from "../storage.js";
import * as canvas from "../canvas.js";

function clean(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "");
}

function processImages(html, base) {
  return String(html || "").replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, (m, src) => {
    if (!/\/files\/|preview|download/i.test(src)) return m;
    const href = /^https?:\/\//.test(src) ? src : `${base}${src}`;
    const isImage = /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(src);
    if (isImage) {
      return `<a href="${esc(href)}" target="_blank" rel="noopener"><img src="${esc(href)}" alt="attachment" class="ann-img" loading="lazy"></a>`;
    }
    return `<a href="${esc(href)}" target="_blank" rel="noopener" class="ann-att">📎 ${esc(src.split("/").pop().split("?")[0] || "file attachment")}</a>`;
  });
}

function annCard(a, courseName, base) {
  const read = (a.read_state || "read") === "read";
  const date = a.posted_at ? fmtDate(a.posted_at.split("T")[0]) : "";
  const author = a.author?.display_name ? ` · ${esc(a.author.display_name)}` : "";
  return `
    <article class="card ann-item ${read ? "read" : ""}" data-id="${esc(a.id)}" data-code="${esc(a.context_code || "")}">
      <header class="ann-header">
        <div class="ann-dot" title="${read ? "Read" : "Unread"}" aria-label="${read ? "Read" : "Unread"}"></div>
        <div class="ann-title-block">
          <h3 class="ann-title">${esc(a.title || "Untitled")}</h3>
          <div class="ann-meta">${esc(courseName)}${author} · ${date}</div>
        </div>
      </header>
      <div class="ann-body">${processImages(clean(a.message), base)}</div>
      <footer class="ann-footer">
        <button class="btn btn-ghost btn-small ann-read" ${read ? "disabled" : ""} aria-label="${read ? "Already read" : "Mark as read"}">${read ? "✓ Read" : "Mark read"}</button>
        ${a.html_url || a.url ? `<a class="btn btn-ghost btn-small" href="${esc(a.html_url || a.url)}" target="_blank" rel="noopener">Open in Canvas ↗</a>` : ""}
      </footer>
    </article>
  `;
}

export async function render(state, root, isStale = () => false) {
  root.innerHTML = `
    <header class="view-header">
      <div>
        <h1>Announcements</h1>
        <p class="subtitle">Announcements from all your courses (last 60 days).</p>
      </div>
      <div class="header-actions">
        <label class="check" style="white-space:nowrap">
          <input type="checkbox" id="annHideRead" title="Hide read announcements"> Hide read
        </label>
        <button id="annMarkAll" class="btn btn-ghost btn-small hidden">Mark all read</button>
        <button id="annRefresh" class="btn btn-ghost btn-small" title="Refresh">↻</button>
      </div>
    </header>
    <section id="annList" class="ann-list"><div class="loading"><div class="spinner"></div><p class="muted small">Loading announcements…</p></div></section>
  `;

  const list = root.querySelector("#annList");
  const markAll = root.querySelector("#annMarkAll");
  const refreshBtn = root.querySelector("#annRefresh");
  const hideReadCb = root.querySelector("#annHideRead");

  const courses = state.data?.courses || [];
  if (!courses.length) {
    list.innerHTML = `<div class="card"><p class="muted">No courses. Refresh data first.</p></div>`;
    return;
  }

  let allItems = [];

  const loadAnnouncements = async () => {
    list.innerHTML = `<div class="loading"><div class="spinner"></div><p class="muted small">Loading announcements…</p></div>`;
    let items;
    try {
      items = await canvas.getAnnouncements(courses.map((c) => `course_${c.id}`));
      if (isStale()) return;
      items = (items || []).filter((a) => a.posted_at);
      items.sort((a, b) => b.posted_at.localeCompare(a.posted_at));
    } catch (e) {
      if (isStale()) return;
      list.innerHTML = `<div class="card"><p class="error">Couldn't load announcements: ${esc(e.message)}</p><p class="hint muted">Your token may be missing the "Announcements" / Discussion scope. Regenerate it in Canvas settings with Announcements access.</p></div>`;
      return;
    }

    allItems = items;
    renderList();
    refreshBtn.addEventListener("click", loadAnnouncements);
    hideReadCb.addEventListener("change", renderList);
  };

  function renderList() {
    const hideRead = hideReadCb.checked;
    const items = hideRead ? allItems.filter((a) => (a.read_state || "read") !== "read") : allItems;
    const unread = allItems.filter((a) => (a.read_state || "read") !== "read").length;

    const courseName = (code) => {
      const id = parseInt(String(code || "").split("_")[1], 10);
      const c = courses.find((x) => x.id === id);
      return c ? c.name : code;
    };
    const base = settings().canvasBaseUrl || "";

    list.innerHTML = `
      <p class="ann-summary">${items.length} announcement${items.length === 1 ? "" : "s"}${unread ? ` · <b style="color:var(--accent)">${unread} unread</b>` : ""}${hideRead ? ` · <span class="muted">(${allItems.length - items.length} hidden)</span>` : ""}</p>
      ${items.map((a) => annCard(a, courseName(a.context_code), base)).join("")}
    `;
    markAll.classList.toggle("hidden", unread === 0);

    const itemEl = (el) => el.closest(".ann-item");
    const setRead = (el) => {
      el.classList.add("read");
      const dot = el.querySelector(".ann-dot");
      if (dot) dot.setAttribute("title", "Read");
      const btn = el.querySelector(".ann-read");
      if (btn) { btn.disabled = true; btn.textContent = "✓ Read"; }
    };

    list.querySelectorAll(".ann-read").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const el = itemEl(btn);
        const cid = parseInt(String(el.dataset.code || "course_0").split("_")[1], 10);
        try {
          await canvas.markAnnouncementRead(cid, el.dataset.id);
          setRead(el);
          if (!list.querySelector(".ann-item:not(.read)")) markAll.classList.add("hidden");
          renderList();
          toast("Marked as read.");
        } catch (e) {
          toast("Couldn't mark read: " + e.message, "err");
        }
      });
    });

    markAll.addEventListener("click", async () => {
      const todo = allItems.filter((a) => (a.read_state || "read") !== "read");
      for (const a of todo) {
        const cid = parseInt(String(a.context_code || "course_0").split("_")[1], 10);
        try { await canvas.markAnnouncementRead(cid, a.id); } catch {}
      }
      list.querySelectorAll(".ann-item").forEach((el) => setRead(el));
      markAll.classList.add("hidden");
      renderList();
      toast(`Marked ${todo.length} announcement${todo.length === 1 ? "" : "s"} read.`);
    });
  }

  await loadAnnouncements();
}