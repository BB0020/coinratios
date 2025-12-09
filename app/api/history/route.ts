// /app/api/history/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 120;

// -----------------------------
// TYPES
// -----------------------------
interface Point { time: number; value: number; }
interface CGResponse { prices: [number, number][]; }
interface FrankfurterResponse { rates: Record<string, Record<string, number>>; }

const isFiat = (s: string) => /^[A-Z]{3,5}$/.test(s);

// -----------------------------
// RANGE → WIDTH
// -----------------------------
function getWidth(days: number): number {
  if (days <= 1) return 300;      // 5–10 min raw (CoinGecko produces ~300s deltas)
  if (days <= 7) return 3600;     // 1h
  if (days <= 30) return 3600;    // 1h
  if (days <= 90) return 10800;   // 3h
  return 86400;                   // 1d
}

// -----------------------------
// FETCH CRYPTO
// -----------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as CGResponse;
  if (!d.prices) return [];

  return d.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// -----------------------------
// FETCH FIAT (Frankfurter)
// -----------------------------
function parseDay(day: string): number {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}

function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];
  const now = new Date();

  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) / 1000;

  const map = new Map<number, number>();
  points.forEach(p => map.set(p.time, p.value));

  const out: Point[] = [];
  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }

  return out;
}

async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    const now = new Date();
    const arr: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const ts =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i) / 1000;
      arr.push({ time: ts, value: 1 });
    }
    return arr.reverse();
  }

  const { start, end } = buildDateRange(days);
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as FrankfurterResponse;
  if (!d.rates) return [];

  const raw: Point[] = Object.keys(d.rates)
    .map(day => ({
      time: parseDay(day),
      value: 1 / d.rates[day][symbol]
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -----------------------------
// BUCKETING (CMC/CG-style)
// -----------------------------
function downsample(raw: Point[], width: number): Point[] {
  if (raw.length === 0) return [];

  const lastTs = raw[raw.length - 1].time;
  const endBucket = Math.floor(lastTs / width) * width;

  const map = new Map<number, number>();

  for (const p of raw) {
    const b = Math.floor(p.time / width) * width;
    if (!map.has(b)) map.set(b, p.value);
    else map.set(b, p.value);
  }

  return Array.from(map.entries())
    .filter(([b]) => b <= endBucket)
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

// -----------------------------
// MERGE A/B SERIES USING NEAREST B
// -----------------------------
function buildNearest(rawB: Point[]) {
  const times = rawB.map(p => p.time);
  const values = rawB.map(p => p.value);

  return function (t: number): number | null {
    let lo = 0, hi = times.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best === -1 ? null : values[best];
  };
}

// -----------------------------
// MAIN ROUTE
// -----------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")!;
    const quote = url.searchParams.get("quote")!;
    const days = Number(url.searchParams.get("days") ?? 30);

    const width = getWidth(days);

    const [rawA, rawB] = await Promise.all([
      isFiat(base.toUpperCase()) ? fetchFiat(base.toUpperCase(), days) : fetchCrypto(base.toLowerCase(), days),
      isFiat(quote.toUpperCase()) ? fetchFiat(quote.toUpperCase(), days) : fetchCrypto(quote.toLowerCase(), days),
    ]);

    if (!rawA.length || !rawB.length)
      return Response.json({ history: [] });

    const dsA = downsample(rawA, width);
    const dsB = downsample(rawB, width);

    const nearest = buildNearest(dsB);

    const out: Point[] = [];
    for (const p of dsA) {
      const div = nearest(p.time);
      if (div && div !== 0) out.push({ time: p.time, value: p.value / div });
    }

    return Response.json({ history: out });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}