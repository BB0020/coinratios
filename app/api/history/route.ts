import { loadSymbolMap } from "../_coinmap";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point { time: number; value: number; }

const isFiat = (id: string): boolean => /^[A-Z]{3,5}$/.test(id);

// ---- FIAT (daily) ----
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    const now = Math.floor(Date.now() / 1000);
    const out = [];
    for (let i = days; i >= 0; i--) {
      out.push({ time: now - i * 86400, value: 1 });
    }
    return out;
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

  const out: Point[] = Object.keys(j.rates).map(day => ({
    time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
    value: 1 / j.rates[day][symbol],
  }));

  return out.sort((a, b) => a.time - b.time);
}

// ---- CRYPTO (CG hourly/daily auto) ----
async function fetchCrypto(cgId: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([t, v]: [number, number]) => ({
    time: Math.floor(t / 1000),
    value: v,
  }));
}

// ---- Downsample hourly → 3H ----
function downsample3H(points: Point[]): Point[] {
  const out: Point[] = [];
  const THREE_H = 3 * 3600;

  let last = points[0].time - THREE_H;

  for (const p of points) {
    if (p.time - last >= THREE_H) {
      out.push(p);
      last = p.time;
    }
  }

  return out;
}

// ---- NEAREST MATCH ----
function buildNearest(points: Point[]) {
  const times = points.map(p => p.time);
  const values = points.map(p => p.value);

  return function nearest(t: number): number | null {
    let lo = 0, hi = times.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best === -1 ? null : values[best];
  };
}

// ---- MAIN ROUTE ----
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    let baseRaw = (url.searchParams.get("base") || "").toUpperCase();
    let quoteRaw = (url.searchParams.get("quote") || "USD").toUpperCase();
    const days = Number(url.searchParams.get("days") || 30);

    const map = await loadSymbolMap();

    const base = isFiat(baseRaw) ? baseRaw : map[baseRaw];
    const quote = isFiat(quoteRaw) ? quoteRaw : map[quoteRaw];

    if (!base || !quote) {
      console.error("Unknown mapping:", { baseRaw, quoteRaw });
      return Response.json({ history: [] });
    }

    const [rawA, rawB] = await Promise.all([
      isFiat(baseRaw) ? fetchFiat(baseRaw, days) : fetchCrypto(base, days),
      isFiat(quoteRaw) ? fetchFiat(quoteRaw, days) : fetchCrypto(quote, days),
    ]);

    if (!rawA.length || !rawB.length) return Response.json({ history: [] });

    // Downsample 90D → 3H
    let A = rawA;
    let B = rawB;

    if (days === 90) {
      A = downsample3H(rawA);
      B = downsample3H(rawB);
    }

    // Build nearest matcher
    const nearest = buildNearest(B);

    const out: Point[] = [];
    for (const p of A) {
      const div = nearest(p.time);
      if (div) out.push({ time: p.time, value: p.value / div });
    }

    return Response.json({ history: out });

  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
