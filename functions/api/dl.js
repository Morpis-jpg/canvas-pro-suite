function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "X-Canvas-Token, X-Canvas-Base, Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get("u") || "";
  const token = request.headers.get("X-Canvas-Token") || "";

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  let parsed;
  try { parsed = new URL(target); } catch { parsed = null; }
  if (!target || !token || !parsed || !/^https?:$/.test(parsed.protocol)) {
    return new Response(JSON.stringify({ message: "Missing or invalid download target" }), {
      status: 400,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }

  let upstream;
  try {
    upstream = await fetch(target, { headers: { Authorization: "Bearer " + token } });
  } catch (error) {
    return new Response("Download proxy failed: " + String(error), { status: 502, headers: cors() });
  }

  const out = new Headers(cors());
  out.set("Content-Type", upstream.headers.get("Content-Type") || "application/octet-stream");
  out.set("Content-Disposition", "inline");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
