const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-AI-Provider, X-AI-Url, X-AI-Key, X-AI-Session, Content-Type, Accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (request.method !== "POST") return json({ message: "Use POST." }, 405);

  const provider = (request.headers.get("X-AI-Provider") || "openai").toLowerCase();
  if (provider === "opencode") {
    return json({ message: "The opencode provider only works with the local server (server.py)." }, 502);
  }

  const url = (request.headers.get("X-AI-Url") || "").trim();
  if (!/^https:\/\//.test(url)) return json({ message: "Missing or invalid X-AI-Url header" }, 400);

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const key = (request.headers.get("X-AI-Key") || "").trim();
  if (key) headers.Authorization = "Bearer " + key;

  let upstream;
  try {
    upstream = await fetch(url, { method: "POST", headers, body: await request.text() });
  } catch (error) {
    return json({ message: "AI upstream error: " + String(error) }, 502);
  }

  const out = new Headers(cors());
  out.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
  out.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
};

export const config = { path: "/api/ai" };
