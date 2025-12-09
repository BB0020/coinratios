// /app/api/history/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 300;

// -----------------------------
// TYPES
// -----------------------------
interface Point {
  time: number;
  value: number;
}

interface CGResponse {
  prices: [number, number][];
}

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

// -----------------------------
// HELPERS
// -----------------------------
const isFiat = (id: string): boolean => /^[A-Z]{3,5}$/.test(id);

function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function parseDay(day: string): number {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}

// Smooth missing daily fiat prices
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) / 1000;

  const map = new Map(points.map((p) => [p.time, p.value]));
  const out: Point[] = [];
  let lastValue = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) lastValue = map.get(t)!;
    out.push({ time: t, value: lastValue });
  }

  return out;
}

// -----------------------------
// COINGECKO CRYPTO FETCH
// -----------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return [];

  const d = (await r.json()) as CGResponse;
  if (!d.prices) return [];

  return d.prices.map(([ts, val]) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

// -----------------------------
// FRANKFURTER FIAT FETCH
// -----------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    const now = new Date();
    const out: Point[] = [];

    for (let i = 0; i <= days; i++) {
      const ts = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - i
      ) / 1000;
      out.push({ time: ts, value: 1 });
    }

    return out.reverse();
  }

  const { start, end } = buildDateRange(days);

  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;
  const r = await fetch(url);

  if (!r.ok) return [];

  const d = (await r.json()) as FrankfurterResponse;

  const raw = Object.keys(d.rates)
    .map((day) => ({
      time: parseDay(day),
      value: 1 / d.rates[day][symbol],
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -----------------------------
// REDUCE HOURLY → 3H BUCKETS
// -----------------------------
function bucket3H(points: Point[]): Point[] {
  const out: Point[] = [];
  let acc: Point[] = [];

  for (const p of points) {
    acc.push(p);

    // 3 hours = 10800 seconds
    if (acc.length === 3) {
      const last = acc[acc.length - 1];
      out.push(last);
      acc = [];
    }
  }

  // Flush leftover <3 pts
  if (acc.length > 0) out.push(acc[acc.length - 1]);

  return out;
}

// -----------------------------
// MERGE A/B INTO RATIO SERIES
// -----------------------------
function nearestFactory(times: number[], values: number[]) {
  return function (t: number): number | null {
    let lo = 0;
    let hi = times.length - 1;
    let best = -1;

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
// MAIN API ROUTE
// -----------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")!;
    const quote = url.searchParams.get("quote")!;
    const days = Number(url.searchParams.get("days") ?? 30);

    // Fetch both sides
    let [A, B] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!A.length || !B.length) {
      return Response.json({ history: [] });
    }

    // Apply 3H reduction to 90D only
    if (days === 90) {
      A = bucket3H(A);
      B = bucket3H(B);
    }

    // Prepare nearest-match lookup for B
    const timesB = B.map((p) => p.time);
    const valuesB = B.map((p) => p.value);
    const nearest = nearestFactory(timesB, valuesB);

    const merged: Point[] = [];

    for (const p of A) {
      const div = nearest(p.time);
      if (div === null) continue;

      merged.push({
        time: p.time,
        value: p.value / div,
      });
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API Error:", err);
    return Response.json({ history: [] });
  }
}