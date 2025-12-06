// /app/api/history/route.ts
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Parse YYYY-MM-DD → UTC midnight timestamp
const parseDay = (d: string) =>
  Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000);

// Build correct date range
function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// Smooth weekend/holiday fiat gaps
function smoothFiat(raw: Point[], days: number): Point[] {
  if (!raw.length) return [];
  raw.sort((a, b) => a.time - b.time);

  const now = new Date();
  const startTs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days
  ) / 1000;

  const map = new Map(raw.map(p => [p.time, p.value]));
  const out: Point[] = [];
  let last = raw[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) {
      last = map.get(t)!;
    }
    out.push({ time: t, value: last });
  }

  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 7);

  try {
    // Fetch crypto from CoinGecko
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url);
      const d = await r.json();
      return (d.prices ?? []).map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    };

    // Fetch fiat from Frankfurter
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      if (symbol === "USD") {
        // USD baseline = 1
        const now = new Date();
        const arr: Point[] = [];
        for (let i = 0; i <= days; i++) {
          const t =
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i) /
            1000;
          arr.push({ time: t, value: 1 });
        }
        return arr.reverse();
      }

      const { start, end } = buildDateRange(days);
      const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;
      const r = await fetch(url);
      const d = await r.json();

      const raw: Point[] = Object.keys(d.rates || {}).map(day => ({
        time: parseDay(day),
        value: 1 / d.rates[day][symbol],
      }));

      return smoothFiat(raw, days);
    };

    // Fetch both series
    const [A, B] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    if (!A.length || !B.length) return Response.json({ history: [] });

    // Build nearest-past lookup for B
    const timesB = B.map(p => p.time);
    const valuesB = B.map(p => p.value);

    const nearestPastIndex = (t: number) => {
      let lo = 0,
        hi = timesB.length - 1,
        best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (timesB[mid] <= t) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best === -1 ? null : best;
    };

    // --------------------------
    // FIX: Skip invalid points until first valid match
    // --------------------------
    const merged: Point[] = [];
    let started = false;

    for (const p of A) {
      const idx = nearestPastIndex(p.time);
      if (idx === null) continue;

      started = true;
      merged.push({
        time: p.time,
        value: p.value / valuesB[idx],
      });
    }

    if (!started || !merged.length) {
      return Response.json({ history: [] });
    }

    return Response.json({ history: merged });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}
