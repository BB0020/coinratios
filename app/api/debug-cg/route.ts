export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.CG_KEY;

  // Check if key exists at backend
  const keyExists = !!key;

  // Try a simple authenticated Coingecko call
  let ping = null;
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/ping", {
      headers: {
        "x-cg-api-key": key ?? "",
      },
      cache: "no-store",
    });
    ping = {
      status: r.status,
      body: await r.text(),
    };
  } catch (err: any) {
    ping = { error: String(err) };
  }

  return Response.json({
    keyExists,
    keySample: key ? key.slice(0, 8) + "..." : null,
    ping,
  });
}
