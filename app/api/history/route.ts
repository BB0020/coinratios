// /app/api/history/route.ts
export const revalidate = 300; // cache 5 minutes

interface Point {
  time: number;   // UNIX seconds
  value: number;  // never null after smoothing
}

// Detect fiat like USD, GBP, CAD, EUR, JPY
const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Convert YYYY-MM-DD → UTC timestamp
const parseDay = (day: string) =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Build clean date range (UTC)
function buildDateRange(days: number) {
  const now = new Date();

  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days
  ));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// Smooth missing FX days (Google Finance style)
// Repeats last known value for weekends/holidays.
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days
  ) / 1000;

  const out: Point[] = [];
  const map = new Map(points.map(p => [p.time, p.value]));
  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;

    if (map.has(t)) {
      last = map.get(t)!;
      out.push({ time: t, value: last });
    } else {
      // Weekend / holiday → repeat last known FX
      out.push({ time: t, value: last });
    }
  }

  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  try {
    // -----------------------------
    // CRYPTO FETCH (CoinGecko)
    // -----------------------------
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url);
      const d = await r.json();

      return (d.prices ?? []).map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    };

    // -----------------------------
    // FIAT FETCH (Frankfurter)
    // Google Finance smoothing applied here
    // -----------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      // USD baseline
      if (symbol === "USD") {
        const now = new Date();
        const arr: Point[] = [];
        for (let i = 0; i <= days; i++) {
          const t = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - i
          ) / 1000;
          arr.push({ time: t, value: 1 });
        }
        return arr.reverse();
      }

      const { start, end } = buildDateRange(days);
      const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;
      const r = await fetch(url);
      const d = await r.json();

      // Convert raw daily FX → array of points
      const raw: Point[] = Object.keys(d.rates || {}).map(day => {
        const rate = d.rates[day][symbol];
        return {
          time: parseDay(day),
          value: 1 / rate, // USD per fiat
        };
      }).sort((a, b) => a.time - b.time);

      // Apply smoothing (Google Finance style)
      return smoothFiat(raw, days);
    };

    // -----------------------------
    // FETCH BASE + QUOTE IN PARALLEL
    // -----------------------------
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    if (!Araw.length || !Braw.length) return Response.json({ history: [] });

    // -----------------------------
    // MERGE (A/B ratio)
    // -----------------------------
    const times = Braw.map(p => p.time);
    const values = Braw.map(p => p.value);

    const nearest = (t: number) => {
      let lo = 0, hi = times.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      return values[lo];
    };

    const merged: Point[] = Araw.map(p => ({
      time: p.time,
      value: p.value / nearest(p.time)
    }));

    return Response.json({ history: merged });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}