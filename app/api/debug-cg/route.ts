export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const testRange = url.searchParams.get("range") === "1";

  const key = process.env.CG_KEY ?? null;
  const keyExists = !!key;

  // Base ping test
  const pingUrl = "https://api.coingecko.com/api/v3/ping";
  const ping = await fetch(pingUrl, {
    headers: {
      accept: "application/json",
      "x-cg-api-key": key ?? "",
    },
  }).then(r => ({ status: r.status, ok: r.ok }))
    .catch(e => ({ error: String(e) }));


  // ───────────────────────────────────────────────
  // RANGE TEST (this is what decides everything)
  // ───────────────────────────────────────────────
  let rangeResult = null;

  if (testRange) {
    const from = 1700000000;
    const to = 1700500000;

    const rangeUrl =
      `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range` +
      `?vs_currency=usd&from=${from}&to=${to}`;

    const r = await fetch(rangeUrl, {
      headers: {
        accept: "application/json",
        "x-cg-api-key": key ?? "",
      },
    });

    const text = await r.text();
    rangeResult = {
      url: rangeUrl,
      status: r.status,
      ok: r.ok,
      bodySample: text.slice(0, 200),
    };
  }

  return Response.json({
    keyExists,
    keyPrefix: key ? key.slice(0, 6) : null,
    ping,
    rangeTest: rangeResult,
  });
}
