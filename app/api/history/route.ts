// /app/api/history/route.ts
import { getSymbolToIdMap } from "../_coinmap";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point { time: number; value: number; }

const FIAT = new Set([
  "USD","EUR","GBP","JPY","CAD","AUD","CHF","CNY","SEK","NZD",
  "INR","BRL","RUB","HKD","SGD","MXN","ZAR"
]);

async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: days + 1 }, (_, i) => ({
      time: now - (days - i) * 86400,
      value: 1,
    }));
  }
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const r = await fetch(
    `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=USD&to=${symbol}`
  );
  if (!r.ok) return [];
  const j = await r.json();
  if (!j.rates) return [];

  return Object.entries(j.rates).map(([day, rate]: [string, any]) => ({
    time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
    value: 1 / rate[symbol],
  })).sort((a, b) => a.time - b.time);
}

async function fetchCrypto(cgId: string, days: number): Promise<Point[]> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=${days}`
  );
  if (!r.ok) return [];
  const j = await r.json();
  if (!j.prices) return [];
  return j.prices.map(([t, v]: [number, number]) => ({
    time: Math.floor(t / 1000),
    value: v,
  }));
}

function downsample3H(points: Point[]): Point[] {
  const out: Point[] = [];
  let last = points[0].time - 3 * 3600;
  for (const p of points) {
    if (p.time - last >= 3 * 3600) {
      out.push(p);
      last = p.time;
    }
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawBase = (url.searchParams.get("base") || "").toUpperCase();
    const rawQuote = (url.searchParams.get("quote") || "").toUpperCase();
    const days = Number(url.searchParams.get("days") || "30");

    const map = await getSymbolToIdMap();

    const base = FIAT.has(rawBase)
      ? rawBase
      : map[rawBase];
    const quote = FIAT.has(rawQuote)
      ? rawQuote
      : map[rawQuote];

    if (!base || !quote) {
      console.error("Unknown symbol in history:", rawBase, rawQuote);
      return Response.json({ history: [] });
    }

    const [rawA, rawB] = await Promise.all([
      FIAT.has(rawBase) ? fetchFiat(rawBase, days) : fetchCrypto(base, days),
      FIAT.has(rawQuote) ? fetchFiat(rawQuote, days) : fetchCrypto(quote, days),
    ]);

    if (!rawA.length || !rawB.length) {
      return Response.json({ history: [] });
    }

    let A = rawA;
    let B = rawB;

    if (days === 90) {
      A = downsample3H(A);
      B = downsample3H(B);
    }

    const timesB = B.map(p => p.time);
    const valuesB = B.map(p => p.value);
    const nearest = (t: number): number | null => {
      let lo = 0, hi = timesB.length - 1, best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (timesB[mid] <= t) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return best >= 0 ? valuesB[best] : null;
    };

    const history: Point[] = [];
    for (const p of A) {
      const divisor = nearest(p.time);
      if (divisor) {
        history.push({ time: p.time, value: p.value / divisor });
      }
    }

    return Response.json({ history });

  } catch (e) {
    console.error("History route error:", e);
    return Response.json({ history: [] });
  }
}
