// /app/api/history/route.ts
export const revalidate = 300; // 5 minutes

// -------------------------------------
// TYPES
// -------------------------------------
export interface Point {
  time: number; // unix timestamp in seconds
  value: number; // price in USD
}

export interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

export interface CGChartResponse {
  prices: [number, number][];
}

// -------------------------------------
// HELPERS
// -------------------------------------
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

// Repeat last known value for missing days (weekends/holidays)
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) /
    1000;

  const out: Point[] = [];
  const map = new Map<number, number>(
    points.map((p: Point) => [p.time, p.value])
  );

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

// -------------------------------------
// FETCH CRYPTO (CoinGecko)
// -------------------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as CGChartResponse;
  if (!d.prices) return [];

  return d.prices.map(([tsMs, price]: [number, number]): Point => ({
    time: Math.floor(tsMs / 1000),
    value: price,
  }));
}

// -------------------------------------
// FETCH FIAT (Frankfurter)
// -------------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  // USD has no fluctuation → stable baseline
  if (symbol === "USD") {
    const now = new Date();
    const pts: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const t =
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - i
        ) / 1000;
      pts.push({ time: t, value: 1 });
    }
    return pts.reverse();
  }

  const { start, end } = buildDateRange(days);
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as FrankfurterResponse;
  if (!d.rates) return [];

  const raw: Point[] = Object.keys(d.rates)
    .map((day: string): Point => {
      const rate = d.rates[day][symbol];
      return {
        time: parseDay(day),
        value: 1 / rate, // convert USD→fiat to fiat→USD
      };
    })
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -------------------------------------
// API HANDLER
// -------------------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const base = searchParams.get("base")!;
    const quote = searchParams.get("quote")!;
    const days = Number(searchParams.get("days") ?? 30);

    if (!base || !quote) {
      return Response.json({ history: [] });
    }

    // Fetch both in parallel
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length) {
      return Response.json({ history: [] });
    }

    // -----------------------------
    // INDEX-ALIGNED MERGING
    // (accurate, stable, prevents mismatches)
    // -----------------------------
    const len = Math.min(Araw.length, Braw.length);
    const merged: Point[] = new Array(len);

    for (let i = 0; i < len; i++) {
      const A = Araw[i];
      const B = Braw[i];

      const ratio = A.value / B.value;

      merged[i] = {
        time: A.time, // timestamps approximately aligned
        value: ratio,
      };
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
