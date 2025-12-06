// /app/api/history/route.ts
export const revalidate = 300; // 5 min cache

// -----------------------------
// TYPES
// -----------------------------
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

// -----------------------------
// HELPERS
// -----------------------------
const isFiat = (id: string): boolean => /^[A-Z]{3,5}$/.test(id);

const parseDay = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

function buildDateRange(days: number): { start: string; end: string } {
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

// Smooth fiat missing days (weekends/holidays)
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) /
    1000;

  const out: Point[] = [];
  const map = new Map<number, number>();
  points.forEach((p) => map.set(p.time, p.value));

  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) {
      last = map.get(t)!;
    }
    out.push({ time: t, value: last });
  }

  return out;
}

// -----------------------------
// FETCH CRYPTO (CoinGecko)
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
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    const now = new Date();
    const arr: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const ts =
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - i
        ) / 1000;
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
    .map((day) => ({
      time: parseDay(day),
      value: 1 / d.rates[day][symbol], // convert to fiat→USD
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -------------------------------------
// FIND NEAREST TIMESTAMP IN B
// -------------------------------------
function nearestTimeFactory(times: number[], values: number[]) {
  return function (t: number): number | null {
    let lo = 0;
    let hi = times.length - 1;
    let bestIndex = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        bestIndex = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return bestIndex === -1 ? null : values[bestIndex];
  };
}

// -----------------------------
// MAIN ROUTE HANDLER
// -----------------------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  try {
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length) return Response.json({ history: [] });

    const timesB = Braw.map((p) => p.time);
    const valuesB = Braw.map((p) => p.value);

    const nearest = nearestTimeFactory(timesB, valuesB);

    const merged: Point[] = [];

    for (const p of Araw) {
      const div = nearest(p.time);
      if (div === null) continue;
      if (div === 0) continue;

      merged.push({
        time: p.time,
        value: p.value / div,
      });
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
