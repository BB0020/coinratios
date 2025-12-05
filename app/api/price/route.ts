import { NextResponse } from "next/server";

const API_KEY = process.env.COINGECKO_API_KEY!;
const CACHE_TTL = 10 * 1000; // 10 seconds

// Cache: { "bitcoin,usd": { data: {...}, ts: number } }
let cache: Record<string, { data: any; ts: number }> = {};

const fiatIDs = [
  "usd","eur","gbp","jpy","cad","aud","chf","cny","dkk","hkd","inr","jpy",
  "krw","mxn","nok","nzd","sek","sgd","try","zar"
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");

  if (!ids) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  const key = ids;
  const now = Date.now();

  if (cache[key] && now - cache[key].ts < CACHE_TTL) {
    return NextResponse.json(cache[key].data);
  }

  const list = ids.split(",");
  const cryptos = list.filter((x) => !fiatIDs.includes(x.toLowerCase()));
  const fiats = list.filter((x) => fiatIDs.includes(x.toLowerCase()));

  let result: Record<string, number> = {};

  // Fetch crypto prices
  if (cryptos.length > 0) {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=" +
      cryptos.join(",") +
      "&vs_currencies=usd";

    const cg = await fetch(url, {
      headers: { "x-cg-demo-api-key": API_KEY },
      cache: "no-store",
    }).then((r) => r.json());

    for (const id of cryptos) {
      result[id] = cg[id]?.usd ?? 0;
    }
  }

  // Fetch fiat prices (FX rates)
  if (fiats.length > 0) {
    const symbols = fiats.map((x) => x.toUpperCase()).join(",");

    const fx = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=" + symbols
    ).then((r) => r.json());

    for (const id of fiats) {
      const rate = fx.rates?.[id.toUpperCase()];
      result[id] = id === "usd" ? 1 : rate ? 1 / rate : 0;
    }
  }

  cache[key] = { data: result, ts: now };

  return NextResponse.json(result);
}
