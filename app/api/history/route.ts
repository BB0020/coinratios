// /app/api/history/route.ts
export const revalidate = 300; // 5 minutes cache

interface Point {
  time: number;  // UNIX seconds
  value: number | null;
}

// Detect fiat symbols (USD, EUR, GBP, etc.)
const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Parse YYYY-MM-DD as UTC midnight
const parseFrankfurterDate = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Build safe UTC date range
function buildDateRange(days: number) {
  const now = new Date();
  const endUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  const startUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days
  ));

  return {
    start: startUTC.toISOString().slice(0, 10),
    end: endUTC.toISOString().slice(0, 10),
  };
}

// MAX allowable past difference: 90 minutes
const MAX_DIFF_SECONDS = 90 * 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  try {
    // ------------------------
    // CRYPTO FETCH (CoinGecko)
    // ------------------------
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url);
      const d = await r.json();

      return (d.prices ?? []).map(([ms, v]: [number, number]) => ({
        time: Math.floor(ms / 1000),
        value: v,
      }));
    };

    // ------------------------
    // FIAT FETCH (Frankfurter)
    // ------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      if (symbol === "USD") {
        // USD stays constant at 1
        const arr: Point[] = [];
        const now = new Date();
        for (let i = 0; i < days; i++) {
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
      const d = await r.json();

      return Object.keys(d.rates)
        .map((day) => {
          const rate = d.rates[day]?.[symbol];
          return {
            time: parseFrankfurterDate(day),
            value: rate ? 1 / rate : null,
          };
        })
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);
    };

    // ---------------------------
    // LOAD BASE + QUOTE IN PARALLEL
    // ---------------------------
    const [baseHist, quoteHist] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    const A = baseHist.sort((a, b) => a.time - b.time);
    const B = quoteHist.sort((a, b) => a.time - b.time);

    if (!A.length || !B.length)
      return Response.json({ history: [] });

    // ---------------------------
    // BUILD NEAREST-PAST LOOKUP
    // ---------------------------
    const times = B.map((p) => p.time);
    const values = B.map((p) => p.value ?? 1);

    function nearestPast(t: number) {
      let lo = 0,
        hi = times.length - 1;
      let bestIndex = -1;

      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) {
          bestIndex = mid; // valid candidate
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (bestIndex === -1) return null;

      const diff = t - times[bestIndex];
      if (diff > MAX_DIFF_SECONDS) return null;

      return values[bestIndex];
    }

    // ---------------------------
    // MERGE RATIO HISTORY
    // ---------------------------
    const merged: Point[] = [];

    for (const pt of A) {
      const divisor = nearestPast(pt.time);
      if (divisor === null || !Number.isFinite(divisor)) continue;

      const ratio = pt.value! / divisor;
      if (!Number.isFinite(ratio)) continue;

      merged.push({ time: pt.time, value: ratio });
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
