import { NextResponse } from "next/server";

const API_KEY = process.env.COINGECKO_API_KEY!;
const CACHE_TTL = 30 * 1000; // 30 seconds

let cache: Record<string, { data: any; ts: number }> = {};

const fiatIDs = [
  "usd","eur","gbp","jpy","cad","aud","chf","cny","dkk","hkd","inr","krw",
  "mxn","nok","nzd","sek","sgd","try","zar"
];

// Map chart ranges → days
const RANGE_MAP: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "1y": 365,
};

async function getCryptoHistory(id: string, days: number) {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const json = await fetch(url, {
    headers: { "x-cg-demo-api-key": API_KEY },
    cache: "no-store",
  }).then((r) => r.json());

  return json.prices || [];
}

async function getFiatHistory(id: string, days: number) {
  if (id === "usd") {
    // USD is always 1
    const arr = [];
    const now = Date.now();
    for (let i = 0; i <= days; i++) {
      arr.push([now - i * 86400000, 1]);
    }
    return arr.reverse();
  }

  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);

  const url = `https://api.frankfurter.app/${start.toISOString().split("T")[0]}..${end
    .toISOString()
    .split("T")[0]}?from=USD&to=${id.toUpperCase()}`;

  const json = await fetch(url).then((r) => r.json());

  const key = id.toUpperCase();
  const out: [number, number][] = [];

  for (const date in json.rates) {
    const rate = json.rates[date]?.[key]; // how many ID per USD
    if (!rate) continue;
    out.push([new Date(date).getTime(), 1 / rate]); // convert value → USD per unit of fiat
  }

  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = url.searchParams.get("range") || "24h";

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to" }, { status: 400 });
  }

  const days = RANGE_MAP[range] || 1;
  const cacheKey = `${from}-${to}-${range}`;
  const now = Date.now();

  if (cache[cacheKey] && now - cache[cacheKey].ts < CACHE_TTL) {
    return NextResponse.json(cache[cacheKey].data);
  }

  const fromIsFiat = fiatIDs.includes(from.toLowerCase());
  const toIsFiat = fiatIDs.includes(to.toLowerCase());

  // ---- FETCH HISTORY ----
  const fromHist = fromIsFiat
    ? await getFiatHistory(from.toLowerCase(), days)
    : await getCryptoHistory(from.toLowerCase(), days);

  const toHist = toIsFiat
    ? await getFiatHistory(to.toLowerCase(), days)
    : await getCryptoHistory(to.toLowerCase(), days);

  // ---- ALIGN BY CLOSEST TIMESTAMP ----
  const result: { t: number; value: number }[] = [];

  let i = 0,
    j = 0;
  while (i < fromHist.length && j < toHist.length) {
    const [t1, v1] = fromHist[i];
    const [t2, v2] = toHist[j];

    // timestamps must be very close (12 hours window)
    if (Math.abs(t1 - t2) < 12 * 3600 * 1000) {
      result.push({ t: t1, value: v1 / v2 });
      i++;
      j++;
    } else if (t1 < t2) {
      i++;
    } else {
      j++;
    }
  }

  cache[cacheKey] = { data: result, ts: now };
  return NextResponse.json(result);
}
