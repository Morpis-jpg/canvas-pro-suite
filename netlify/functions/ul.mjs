const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
});

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const MAX_BYTES = 25 * 1024 * 1024;

export default async (request) => {
  const url = new URL(request.url);
  const target = url.searchParams.get("u") || "";
  const contentType = (request.headers.get("Content-Type") || "").trim();

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (request.method !== "POST") return json({ message: "Use POST." }, 405);

  let parsed;
  try { parsed = new URL(target); } catch { parsed = null; }
  if (!target || !parsed || parsed.protocol !== "https:" || !contentType) {
    return json({ message: "Missing or invalid upload target" }, 400);
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return json({ message: "Upload too large for this mirror (25 MB max)." }, 413);

  let upstream;
  try {
    upstream = await fetch(target, { method: "POST", headers: { "Content-Type": contentType }, body });
  } catch (error) {
    return json({ message: "Upload relay failed: " + String(error) }, 502);
  }

  const out = new Headers(cors());
  out.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
  out.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
};

export const config = { path: "/api/ul" };
