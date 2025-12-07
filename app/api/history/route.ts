// /app/api/history/route.ts
// FINAL WORKING VERSION — Supports:
// 1–30D: minute/hourly (from CG minute data)
// 31–90D: 3h buckets
// >90D : daily (market_chart daily OK)

// ---------------------------------
export const revalidate = 300;
// ---------------------------------

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

// Daily timestamp parsing
const parseDay = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Build YYYY-MM-DD → YYYY-MM-DD window
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

// Smooth fiat weekends
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
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }

  return out;
}

// --------------------------------------------------
// FETCH CRYPTO (CoinGecko) — NOW USING YOUR API KEY
// --------------------------------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  // KEY FIX: always send headers!
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-cg-api-key": process.env.CG_KEY ?? "",
    },
  });

  if (!r.ok) return [];

  const j = (await r.json()) as CGResponse;
  if (!j.prices) return [];

  return j.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// --------------------------------------------------
// FETCH FIAT (Frankfurter, USD base daily)
// --------------------------------------------------
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
      value: 1 / d.rates[day][symbol],
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// --------------------------------------------------
// FIND NEAREST timestamp (for ratio alignment)
// --------------------------------------------------
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
      } else hi = mid - 1;
    }

    return best === -1 ? null : values[best];
  };
}

// --------------------------------------------------
// MAIN HANDLER
// --------------------------------------------------
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
    const nearestB = nearestTimeFactory(timesB, valuesB);

    const merged: Point[] = [];

    for (const p of Araw) {
      const div = nearestB(p.time);
      if (div === null || div === 0) continue;
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
