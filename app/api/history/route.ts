// /app/api/history/route.ts
export const revalidate = 300; // 5 min cache

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Convert YYYY-MM-DD → UTC midnight timestamp
const parseDay = (day: string) =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Build UTC date range for Frankfurter
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
    end: end.toISOString().slice(0, 10) 
  };
}

// Smooth fiat: Google Finance style (repeat last known value)
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
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
      );
      const d = await r.json();

      return (d.prices ?? []).map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    };

    // -----------------------------
    // FIAT FETCH (Frankfurter)
    // -----------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
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
      const r = await fetch(
        `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`
      );
      const d = await r.json();

      const raw: Point[] = Object.keys(d.rates || {}).map(day => {
        const rate = d.rates[day][symbol];
        return { 
          time: parseDay(day), 
          value: 1 / rate 
        };
      }).sort((a, b) => a.time - b.time);

      return smoothFiat(raw, days);
    };

    // -----------------------------
    // FETCH BOTH SERIES
    // -----------------------------
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    if (!Araw.length || !Braw.length)
      return Response.json({ history: [] });

    // -----------------------------
    // BUILD NEAREST-PAST LOOKUP
    // -----------------------------
    const timesB = Braw.map(p => p.time);
    const valuesB = Braw.map(p => p.value);

    // Correct industry-standard alignment:
    // Pick the nearest timestamp <= target timestamp
    const nearestPast = (t: number): number | null => {
      let lo = 0;
      let hi = timesB.length - 1;

      if (timesB[0] > t) return null; // no past data → skip

      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (timesB[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      return valuesB[lo];
    };

    // -----------------------------
    // MERGE USING BASE TIMELINE
    // -----------------------------
    const merged: Point[] = [];

    for (const p of Araw) {
      const divisor = nearestPast(p.time);
      if (divisor === null) continue; // no past quote → skip early points
      merged.push({
        time: p.time,
        value: p.value / divisor,
      });
    }

    return Response.json({ history: merged });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}
