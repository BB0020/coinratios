// /app/api/history/route.ts
export const revalidate = 300; // 5 minutes cache

// Unified point interface
interface Point {
  time: number;       // UNIX seconds
  value: number | null;
}

// Detect fiat: 3–5 uppercase letters (USD, GBP, EUR, etc.)
const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Force-parse YYYY-MM-DD as UTC midnight safely
const parseFrankfurterDate = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Generate UTC-safe date range for Frankfurter
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

  const start = startUTC.toISOString().slice(0, 10);
  const end = endUTC.toISOString().slice(0, 10);

  return { start, end };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  try {
    // -----------------------------
    // FETCH CRYPTO (Coingecko)
    // -----------------------------
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url);
      const d = await r.json();

      // d.prices = [ [timestamp_ms, price], ... ]
      return (d.prices ?? []).map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000), // ms → seconds
        value: p[1],
      }));
    };

    // -----------------------------
    // FETCH FIAT (Frankfurter)
    // -----------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      // USD = constant 1.0 baseline
      if (symbol === "USD") {
        const now = new Date();
        const arr: Point[] = [];
        for (let i = 0; i < days; i++) {
          const ts = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - i
          ) / 1000;
          arr.push({ time: ts, value: 1 });
        }
        return arr.reverse();
      }

      const { start, end } = buildDateRange(days);
      console.log("FRANKFURTER RANGE:", start, end);
      console.log("NOW:", new Date().toISOString());
      const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;

      const r = await fetch(url);
      const d = await r.json();

      // d.rates: { "YYYY-MM-DD": { GBP: 0.78 }, ... }
      return Object.keys(d.rates)
        .map((day) => {
          const val = d.rates[day]?.[symbol];
          return {
            time: parseFrankfurterDate(day),
            value: val ? 1 / val : null, // Convert to USD-per-fiat
          };
        })
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);
    };

    // -----------------------------
    // LOAD BOTH HISTORIES IN PARALLEL
    // -----------------------------
    const [baseHist, quoteHist] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    const A = baseHist.sort((a, b) => a.time - b.time);
    const B = quoteHist.sort((a, b) => a.time - b.time);

    if (!A.length || !B.length) return Response.json({ history: [] });

    // -----------------------------
    // BUILD NEAREST-MATCH LOOKUP
    // -----------------------------
    const times = B.map((p) => p.time);
    const values = B.map((p) => p.value ?? 1);

    const nearest = (t: number): number => {
      let lo = 0;
      let hi = times.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < t) lo = mid + 1;
        else hi = mid;
      }
      const v = values[lo];
      return Number.isFinite(v) ? (v as number) : 1;
    };

    // -----------------------------
    // MERGE INTO RATIO HISTORY
    // -----------------------------
    const merged: Point[] = A.map((p) => {
      const divisor = nearest(p.time);
      const val = p.value! / divisor;
      return {
        time: p.time,
        value: Number.isFinite(val) ? val : null,
      };
    })
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.time - b.time);

    return Response.json({ history: merged });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}
