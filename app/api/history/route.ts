// /app/api/history/route.ts
export const revalidate = 300; // cache 5 minutes

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Parse YYYY-MM-DD as UTC timestamp
const parseDay = (d: string) =>
  Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000);

// Build YYYY-MM-DD range for Frankfurter
function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

// Fill missing fiat days by carrying last value (Google Finance style)
function smoothFiat(raw: Point[], days: number): Point[] {
  if (!raw.length) return [];

  const now = new Date();
  const startTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) / 1000;

  const map = new Map(raw.map(p => [p.time, p.value]));
  let last = raw[0].value;

  const out: Point[] = [];
  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) {
      last = map.get(t)!;
      out.push({ time: t, value: last });
    } else {
      out.push({ time: t, value: last }); // weekend/holiday
    }
  }

  return out;
}

// -------------------------------------------
// MAIN API
// -------------------------------------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  try {
    // -----------------------------
    // FETCH CRYPTO (CoinGecko)
    // -----------------------------
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url);
      const d = await r.json();

      return (d.prices ?? []).map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1]
      }));
    };

    // -----------------------------
    // FETCH FIAT (Frankfurter)
    // -----------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      if (symbol === "USD") {
        // USD baseline = 1.0 constant
        const now = new Date();
        const out: Point[] = [];
        for (let i = 0; i <= days; i++) {
          const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i) / 1000;
          out.push({ time: t, value: 1 });
        }
        return out.reverse();
      }

      const { start, end } = buildDateRange(days);
      const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;
      const r = await fetch(url);
      const d = await r.json();

      const raw: Point[] = Object.keys(d.rates ?? {}).map(day => {
        const rate = d.rates[day][symbol]; // USD→fiat
        return {
          time: parseDay(day),
          value: 1 / rate // convert fiat→USD
        };
      }).sort((a, b) => a.time - b.time);

      return smoothFiat(raw, days);
    };

    // -----------------------------
    // LOAD BOTH SERIES
    // -----------------------------
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    if (!Araw.length || !Braw.length) return Response.json({ history: [] });

    // -----------------------------
    // INDEX-BASED ALIGNMENT
    // (Matches your test script expectations)
    // -----------------------------
    const L = Math.min(Araw.length, Braw.length);
    const result: Point[] = [];

    for (let i = 0; i < L; i++) {
      const ratio = Araw[i].value / Braw[i].value;
      if (!Number.isFinite(ratio)) continue;

      result.push({
        time: Araw[i].time, // keep base timestamps
        value: ratio
      });
    }

    return Response.json({ history: result });

  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
