export const dynamic = "force-dynamic";
export const revalidate = 300;

// -------------------------------------------
// TYPES
// -------------------------------------------
interface Point {
  time: number;
  value: number;
}

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

interface CGResponse {
  prices: [number, number][];
}

// -------------------------------------------
// HELPERS
// -------------------------------------------
const isFiat = (id: string): boolean => /^[A-Z]{3,5}$/.test(id);

const parseDay = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

function buildDateRange(days: number) {
  const now = new Date();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// Smooth fiat missing dates
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) /
    1000;

  const map = new Map<number, number>();
  points.forEach((p) => map.set(p.time, p.value));
  const out: Point[] = [];

  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }

  return out;
}

// -------------------------------------------
// CRYPTO FETCH (CoinGecko)
// -------------------------------------------
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

// -------------------------------------------
// FIAT FETCH (Frankfurter)
// -------------------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    const now = new Date();
    const out: Point[] = [];

    for (let i = 0; i <= days; i++) {
      const ts =
        Date.UTC(
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
  if (!d.rates) return [];

  const raw: Point[] = Object.keys(d.rates)
    .map((day) => ({
      time: parseDay(day),
      value: 1 / d.rates[day][symbol],
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -------------------------------------------
// EXACT 3-HOUR SAMPLING FOR 90D (~720 points)
// -------------------------------------------
function to3HourExact(points: Point[]): Point[] {
  if (!points.length) return [];

  const sorted = [...points].sort((a, b) => a.time - b.time);
  const THREE_HOURS = 3 * 3600;
  const start = sorted[0].time;
  const end = sorted[sorted.length - 1].time;

  const out: Point[] = [];

  for (let t = start; t <= end; t += THREE_HOURS) {
    // last close <= t
    let close: Point | null = null;

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].time <= t) {
        close = sorted[i];
        break;
      }
    }

    if (close) out.push({ time: t, value: close.value });
  }

  return out;
}

// -------------------------------------------
// NEAREST VALUE MATCHING (ratio merge)
// -------------------------------------------
function nearestTimeFactory(times: number[], values: number[]) {
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

// -------------------------------------------
// MAIN API ROUTE
// -------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")!;
    const quote = url.searchParams.get("quote")!;
    const days = Number(url.searchParams.get("days") ?? 30);

    // Fetch raw A/B series
    const [rawA, rawB] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!rawA.length || !rawB.length) {
      return Response.json({ history: [] });
    }

    // Apply 3-hour sampling only for 90D
    const A = days === 90 ? to3HourExact(rawA) : rawA;
    const B = days === 90 ? to3HourExact(rawB) : rawB;

    if (!A.length || !B.length) return Response.json({ history: [] });

    // Prepare nearest-match for merging
    const mapB: Map<number, number> = new Map(
      B.map((p: Point) => [p.time, p.value])
    );

    const timesB = Array.from(mapB.keys()).sort((a, b) => a - b);
    const valuesB = timesB.map((t) => mapB.get(t)!);

    const nearest = nearestTimeFactory(timesB, valuesB);

    // Build final ratio series
    const merged: Point[] = [];

    for (const p of A) {
      const div = nearest(p.time);
      if (!div) continue;

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