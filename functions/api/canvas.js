function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "X-Canvas-Token, X-Canvas-Base, Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function rewriteLink(value, origin) {
  const parts = [];
  for (const raw of value.split(",")) {
    const target = raw.trim().split(";")[0].replace(/^<|>$/g, "");
    let u;
    try { u = new URL(target); } catch { continue; }
    if (!u.pathname) continue;
    const rel = raw.includes(";") ? ";" + raw.split(";").slice(1).join(";") : "";
    parts.push("<" + origin + "/api/canvas?p=" + encodeURIComponent(u.pathname + (u.search || "")) + ">" + rel);
  }
  return parts.join(", ");
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.searchParams.get("p") || "";
  const token = request.headers.get("X-Canvas-Token") || "";
  const base = (request.headers.get("X-Canvas-Base") || "").replace(/\/$/, "");

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (!path || !token || !base) return json({ message: "Missing Canvas proxy parameters." }, 400);

  let target;
  try { target = new URL(base + path); } catch { return json({ message: "Invalid Canvas proxy target." }, 400); }
  if (!/^https?:$/.test(target.protocol) || !target.pathname.startsWith("/api/")) {
    return json({ message: "Invalid Canvas proxy target." }, 400);
  }

  const headers = { Authorization: "Bearer " + token, Accept: "application/json" };
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers["Content-Type"] = contentType;
  const init = { method: request.method, headers };
  if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();

  let upstream;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (error) {
    return json({ message: "Canvas proxy failed: " + String(error) }, 502);
  }

  const out = new Headers(cors());
  out.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
  out.set("Cache-Control", "no-store");
  const link = upstream.headers.get("Link");
  if (link) out.set("Link", rewriteLink(link, url.origin));
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
