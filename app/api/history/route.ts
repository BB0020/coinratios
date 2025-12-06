// /app/api/history/route.ts
export const revalidate = 300; // Cache 5 minutes

interface Point {
  time: number; // UNIX seconds
  value: number | null;
}

// Detect fiat: 3–5 uppercase letters (USD, GBP, EUR, CAD, AUD, etc)
const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Parse YYYY-MM-DD as UTC midnight
const parseFrankfurterDate = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Build safe UTC date range
function buildDateRange(days: number) {
  const now = new Date();

  const endUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const startUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

  return {
    start: startUTC.toISOString().slice(0, 10),
    end: endUTC.toISOString().slice(0, 10),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  try {
    // -----------------------------
    // FETCH CRYPTO HISTORY (Coingecko)
    // -----------------------------
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url);
      const d = await r.json();

      // Coingecko: [ ms_timestamp, price ]
      return (d.prices ?? []).map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    };

    // -----------------------------
    // FETCH FIAT HISTORY (Frankfurter /range endpoint)
    // -----------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      // USD = constant 1
      if (symbol === "USD") {
        const now = new Date();
        const arr: Point[] = [];

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

      // IMPORTANT: Use /range endpoint (much more reliable than path syntax)
      const url = `https://api.frankfurter.app/range?amount=1&from=USD&to=${symbol}&start_date=${start}&end_date=${end}`;

      const r = await fetch(url);
      const data = await r.json();

      if (!data.rates || typeof data.rates !== "object") {
        return [];
      }

      // Convert rates to USD-per-symbol using 1 / FX rate
      return Object.keys(data.rates)
        .map((day) => {
          const val = data.rates[day]?.[symbol];
          return {
            time: parseFrankfurterDate(day),
            value: val ? 1 / val : null,
          };
        })
        .filter((p) => Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);
    };

    // -----------------------------
    // LOAD BOTH HISTORIES
    // -----------------------------
    const [baseHist, quoteHist] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    const A = baseHist.sort((a, b) => a.time - b.time);
    const B = quoteHist.sort((a, b) => a.time - b.time);

    if (!A.length || !B.length) {
      return Response.json({ history: [] });
    }

    // -----------------------------
    // NEAREST-MATCH LOOKUP FOR B
    // -----------------------------
    const times = B.map((p) => p.time);
    const values = B.map((p) => p.value ?? 1);

    const nearest = (t: number): number => {
      let lo = 0,
        hi = times.length - 1;

      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < t) lo = mid + 1;
        else hi = mid;
      }

      const v = values[lo];
      return Number.isFinite(v) ? v! : 1;
    };

    // -----------------------------
    // MERGE INTO RATIO HISTORY
    // -----------------------------
    const merged: Point[] = A.map((p) => {
      const div = nearest(p.time);
      const val = p.value! / div;

      return {
        time: p.time,
        value: Number.isFinite(val) ? val : null,
      };
    })
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.time - b.time);

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API Error:", err);
    return Response.json({ history: [] });
  }
}