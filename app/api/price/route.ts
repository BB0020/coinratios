import { NextResponse } from "next/server";

const cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 10 * 1000; // 10 seconds

// Fiat IDs used in /api/coins
const fiatIDs = [
  "usd","aud","brl","cad","chf","cny","dkk","eur","gbp","hkd",
  "inr","jpy","krw","mxn","nok","nzd","sek","sgd","try","zar"
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  if (!ids) return NextResponse.json({ error: "Missing ids" }, { status: 400 });

  const list = ids.split(",");

  // Cache key
  const key = ids;
  if (cache[key] && Date.now() - cache[key].ts < CACHE_TTL) {
    return NextResponse.json(cache[key].data);
  }

  // Split into crypto + fiat using IDs
  const cryptos = list.filter((x) => !fiatIDs.includes(x.toLowerCase()));
  const fiats = list.filter((x) => fiatIDs.includes(x.toLowerCase()));

  let result: Record<string, number> = {};

  // ----------------------------------------
  // CRYPTO PRICES (via CoinGecko IDs)
  // ----------------------------------------
  if (cryptos.length) {
    const cg = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cryptos.join(",")}&vs_currencies=usd`
    ).then((r) => r.json());

    for (const id of cryptos) {
      result[id] = cg[id]?.usd ?? 0;
    }
  }

  // ----------------------------------------
  // FIAT PRICES (via Frankfurter)
  // ----------------------------------------
  if (fiats.length) {
    const symbols = fiats.map((f) => f.toUpperCase()).join(",");
    const fx = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${symbols}`
    ).then((r) => r.json());

    for (const id of fiats) {
      const rate = fx.rates?.[id.toUpperCase()];
      result[id] = id === "usd" ? 1 : (rate ? 1 / rate : 0);
    }
  }

  // Cache result
  cache[key] = { data: result, ts: Date.now() };

  return NextResponse.json(result);
}
