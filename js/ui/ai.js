import { esc, toast } from "../utils.js";
import { settings, doneIds } from "../storage.js";

function snapshot(state) {
  const courses = state.data?.courses || [];
  const tasks = state.data?.tasks || [];
  const done = new Set(doneIds());
  const open = tasks
    .filter((t) => !t.submitted && !done.has(t.id) && t.canvasId)
    .sort((a, b) => +new Date(a.dueAt || 0) - +new Date(b.dueAt || 0))
    .slice(0, 12);
  const overdue = open.filter((t) => t.dueAt && Date.now() > +new Date(t.dueAt)).length;
  return [
    "You are connected to my Canvas via the Canvas Pro study app. Help me with schoolwork.",
    `Courses (${courses.length}):`,
    ...courses.map((c) => `- ${c.name}: ${c.currentScore != null ? c.currentScore + "%" : "no grade yet"}${c.targetGrade && c.currentScore != null && c.currentScore < c.targetGrade ? " (below target " + c.targetGrade + ")" : ""}`),
    `Open unsubmitted tasks (${open.length}, ${overdue} overdue):`,
    ...open.map((t) => `- ${t.title} (${t.courseName || ""}) ${t.pointsPossible || "?"}pts due ${t.dueAt || "?"}${t.needsGrading ? " PENDING GRADING" : ""}`),
    "Keep answers concise and practical.",
  ].join("\n");
}

export function render(state, root, isStale = () => false) {
  const s = settings();
  const messages = [];
  let ocSession = null;
  let ctxOn = true;

  root.innerHTML = `
    <h1>AI Assistant</h1>
    <p class="subtitle">Chat with a model that already knows your courses, grades, and open work. Configure the provider in <b>Settings → AI</b> first.</p>

    ${(!s.aiKey && s.aiProvider !== "opencode") ? `<div class="card mt"><b>🔑 No AI key set yet.</b> Go to <b>Settings → AI</b> and pick a provider + key (or choose <b>opencode</b> to use your local opencode — no key needed).</div>` : ""}

    <div class="card chat-card mt">
      <div class="chat-wrap" id="chatWrap" aria-live="polite"></div>
      <div class="ai-input-row">
        <textarea id="aiIn" rows="2" placeholder="Ask about your coursework, e.g. “what should I do first today?”" style="flex:1;padding:11px 13px;border-radius:11px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);font-size:13px;resize:none"></textarea>
        <button id="aiSend" class="btn btn-primary" style="align-self:flex-end">Send</button>
      </div>
      <div class="ai-tools">
        <label class="check"><input type="checkbox" id="aiCtx" checked /> <span>Include my Canvas snapshot</span></label>
        <button id="aiClear" class="btn btn-ghost btn-small">Clear chat</button>
        <span class="small muted" style="margin-left:auto">provider: ${esc(s.aiProvider)}${s.aiModel ? " · " + esc(s.aiModel) : ""}</span>
      </div>
    </div>
  `;

  const wrap = root.querySelector("#chatWrap");
  const inp = root.querySelector("#aiIn");
  const btn = root.querySelector("#aiSend");
  const ctx = root.querySelector("#aiCtx");
  ctx.addEventListener("change", () => ctxOn = ctx.checked);
  root.querySelector("#aiClear").addEventListener("click", () => {
    ocSession = null; messages.length = 0; wrap.innerHTML = "";
  });

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  btn.addEventListener("click", send);

  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = text;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
    messages.push({ role: role === "bot" ? "assistant" : "user", content: text });
    return div;
  }

  async function send() {
    const text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    addMsg("user", text);
    const prov = s.aiProvider || "openai";
    try {
      if (prov !== "opencode" && !s.aiKey) throw new Error("No AI key configured — add one in Settings → AI.");
      const body = { model: s.aiModel || undefined };
      if (prov === "opencode") {
        // opencode keeps conversation in its own session; we send one fresh
        // user message (with Canvas context prefixed) and reuse the session.
        const withCtx = ctxOn ? `[My Canvas context]\n${snapshot(state)}\n\n---\n${text}` : text;
        body.messages = [{ role: "user", content: withCtx }];
      } else {
        const messagesWithCtx = messages.map((m) => ({ ...m }));
        if (ctxOn) messagesWithCtx.splice(0, 0, { role: "system", content: snapshot(state) });
        body.messages = messagesWithCtx;
      }
      const headers = {
        "Content-Type": "application/json",
        "X-AI-Provider": prov,
        "X-AI-Url": s.aiUrl || (prov === "opencode" ? "http://localhost:4096" : "https://api.openai.com/v1/chat/completions"),
      };
      if (s.aiKey) headers["X-AI-Key"] = s.aiKey;
      if (prov === "opencode") headers["X-AI-Session"] = ocSession || "";
      const resp = await fetch("api/ai", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const sid = resp.headers.get("X-AI-Session");
      if (sid) ocSession = sid;
      const rawText = await resp.text();
      let data = {};
      try { data = JSON.parse(rawText); } catch (e) {}
      if (!resp.ok) {
        let why = data.error?.message || data.message || (data.error && (data.error.code || data.error.status)) || "";
        if (!why && rawText.trim().startsWith("<")) {
          const m = /<p>(.*?)<\/p>/.exec(rawText);
          why = m ? m[1].replace(/<[^>]*>/g, "") : rawText.slice(0, 200);
        }
        if (prov === "opencode" && !why) why = "Local opencode server refused. Is `opencode serve` running? (Start it in a terminal: `opencode serve`)";
        throw new Error(why || ("HTTP " + resp.status));
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("No reply content in response");
      if (isStale()) return;
      addMsg("bot", content);
    } catch (err) {
      const nf = (err instanceof TypeError && /failed to fetch/i.test(err.message)) || /networkerror/i.test(err.message || "");
      const msg = nf
        ? prov === "opencode"
          ? "⚠️ Couldn't reach `opencode serve` (is it running? Start it in a terminal: `opencode serve`)."
          : "⚠️ Couldn't reach the local server (\"Failed to fetch\"). This is not an API-key problem — make sure the server has been restarted with the latest code: stop it with Ctrl+C, then run `npm start` again, and reload this page."
        : "⚠️ " + (err.message || String(err));
      if (!isStale()) addMsg("bot", msg);
      if (nf && prov !== "opencode") toast("No response from local server — restart it (Ctrl+C, then npm start).", "err");
    }
  }
}