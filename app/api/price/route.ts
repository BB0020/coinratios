import { NextResponse } from "next/server";

const API_KEY = process.env.COINGECKO_API_KEY!;

// List of fiat currencies we support
const fiatIDs = [
  "usd","eur","gbp","jpy","cad","aud","chf","cny","dkk",
  "hkd","inr","krw","mxn","nok","nzd","sek","sgd","try","zar"
];

// Cache to prevent rate limits + improve speed
let cache: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 10 * 1000; // 10 seconds

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const key = `${from}_${to}`;
  const now = Date.now();

  // Use cache if available
  if (cache[key] && now - cache[key].ts < CACHE_TTL) {
    return NextResponse.json(cache[key].data);
  }

  const isFromFiat = fiatIDs.includes(from.toLowerCase());
  const isToFiat = fiatIDs.includes(to.toLowerCase());

  let resultPrice = 0;

  // -----------------------------------------------------
  // CASE 1: FROM CRYPTO → fetch USD price
  // -----------------------------------------------------
  let fromUSD = 0;
  if (!isFromFiat) {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${from}&vs_currencies=usd`,
      {
        headers: { "x-cg-demo-api-key": API_KEY },
        cache: "no-store"
      }
    ).then(r => r.json());

    fromUSD = r[from]?.usd ?? 0;
  } else {
    // Fiat case (FROM)
    if (from.toLowerCase() === "usd") {
      fromUSD = 1;
    } else {
      const fx = await fetch(
        `https://api.frankfurter.app/latest?from=${from.toUpperCase()}&to=USD`
      ).then(r => r.json());

      fromUSD = fx.rates?.USD ?? 0;
    }
  }

  // -----------------------------------------------------
  // CASE 2: TO CRYPTO → fetch USD price
  // -----------------------------------------------------
  let toUSD = 0;
  if (!isToFiat) {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${to}&vs_currencies=usd`,
      {
        headers: { "x-cg-demo-api-key": API_KEY },
        cache: "no-store"
      }
    ).then(r => r.json());

    toUSD = r[to]?.usd ?? 1;
  } else {
    // Fiat case (TO)
    if (to.toLowerCase() === "usd") {
      toUSD = 1;
    } else {
      const fx = await fetch(
        `https://api.frankfurter.app/latest?from=${to.toUpperCase()}&to=USD`
      ).then(r => r.json());

      // If 1 USD = x EUR, then 1 EUR = 1/x USD
      const rate = fx.rates?.USD;
      toUSD = rate ? 1 / rate : 0;
    }
  }

  // Avoid divide-by-zero
  if (toUSD === 0) toUSD = 1;

  // Final conversion rate
  resultPrice = fromUSD / toUSD;

  const payload = { price: resultPrice };

  // Save to cache
  cache[key] = { data: payload, ts: now };

  return NextResponse.json(payload);
}
