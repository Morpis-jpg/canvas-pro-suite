export default async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  return new Response(
    JSON.stringify({ message: "The local agent only works with the local server (npm start) — it needs Ollama on your machine." }),
    { status: 502, headers },
  );
};

export const config = { path: "/api/agent" };
