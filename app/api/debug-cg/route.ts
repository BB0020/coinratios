export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol") ?? "btc";

  // Use the same resolution logic your history API uses
  const realIdUrl = `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart/range?vs_currency=usd&from=${Math.floor(Date.now()/1000)-86400}&to=${Math.floor(Date.now()/1000)}`;

  const r = await fetch(realIdUrl, {
    headers: {
      "x-cg-api-key": process.env.CG_KEY ?? "MISSING_KEY",
    }
  });

  const text = await r.text();

  return Response.json({
    keyLoaded: process.env.CG_KEY ? "YES" : "NO",
    status: r.status,
    symbol,
    responseText: text.slice(0, 200) + "...",
    realIdUrl,
  });
}