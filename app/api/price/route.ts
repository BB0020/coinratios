import { NextResponse } from "next/server";

const API_KEY = process.env.COINGECKO_API_KEY!;
const CACHE_TTL = 10 * 1000; // 10 seconds

let cache: Record<string, { data: any; ts: number }> = {};

const fiatIDs = [
  "usd","eur","gbp","jpy","cad","aud","chf","cny","dkk","hkd","inr","krw",
  "mxn","nok","nzd","sek","sgd","try","zar"
];

// Fetch crypto price in USD
async function getCryptoPrice(id: string) {
  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;

  const data = await fetch(url, {
    headers: { "x-cg-demo-api-key": API_KEY },
    cache: "no-store"
  }).then((r) => r.json());

  return data[id]?.usd ?? null;
}

// Fetch fiat price in USD (via FX rate API)
async function getFiatPrice(id: string) {
  if (id === "usd") return 1;

  const fx = await fetch(
    `https://api.frankfurter.app/latest?from=USD&to=${id.toUpperCase()}`
  ).then((r) => r.json());

  const rate = fx?.rates?.[id.toUpperCase()];
  if (!rate) return null;

  return 1 / rate; // convert 1 unit of fiat → USD
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const cacheKey = `${from}-${to}`;
  const now = Date.now();

  // Cache hit
  if (cache[cacheKey] && now - cache[cacheKey].ts < CACHE_TTL) {
    return NextResponse.json(cache[cacheKey].data);
  }

  const fromIsFiat = fiatIDs.includes(from.toLowerCase());
  const toIsFiat = fiatIDs.includes(to.toLowerCase());

  let fromUSD: number | null = null;
  let toUSD: number | null = null;

  // ------- Fetch FROM price -------
  if (fromIsFiat) {
    fromUSD = await getFiatPrice(from.toLowerCase());
  } else {
    fromUSD = await getCryptoPrice(from.toLowerCase());
  }

  // ------- Fetch TO price -------
  if (toIsFiat) {
    toUSD = await getFiatPrice(to.toLowerCase());
  } else {
    toUSD = await getCryptoPrice(to.toLowerCase());
  }

  if (fromUSD === null || toUSD === null) {
    return NextResponse.json({ error: "Price not available" }, { status: 400 });
  }

  // ------- Compute ratios -------
  const price = fromUSD / toUSD;       // 1 FROM = X TO
  const inverse = toUSD / fromUSD;     // 1 TO = X FROM

  const result = {
    from,
    to,
    price,
    inverse,
    fromUSD,
    toUSD,
  };

  // Cache it
  cache[cacheKey] = { data: result, ts: now };

  return NextResponse.json(result);
}
