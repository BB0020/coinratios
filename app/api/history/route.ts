// /app/api/history/route.ts
export const revalidate = 300; // 5 min CDN cache

interface Point {
  time: number;
  value: number;
}

const isFiat = (s: string) => /^[A-Z]{3,5}$/.test(s);

// ---------------------------------------------
// Helpers
// ---------------------------------------------
function parseDay(day: string) {
  return Math.floor(new Date(day + "T00:00:00Z").getTime() / 1000);
}

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

// Smooth fiat gaps like Google Finance
function smoothFiat(raw: Point[], days: number): Point[] {
  if (!raw.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - days
    ) / 1000;

  // Build a map for quick lookup
  const map = new Map(raw.map((p) => [p.time, p.value]));
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

// ---------------------------------------------
// Main Route Handler
// ---------------------------------------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  try {
    // ---------------------------------------------
    // Fetch crypto from CoinGecko
    // ---------------------------------------------
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!json.prices) return [];

      return json.prices.map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    };

    // ---------------------------------------------
    // Fetch fiat from Frankfurter + smoothing
    // ---------------------------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      if (symbol === "USD") {
        // USD baseline = 1
        const now = new Date();
        const out: Point[] = [];
        for (let i = 0; i <= days; i++) {
          const t =
            Date.UTC(
              now.getUTCFullYear(),
              now.getUTCMonth(),
              now.getUTCDate() - i
            ) / 1000;
          out.push({ time: t, value: 1 });
        }
        return out.reverse();
      }

      const { start, end } = buildDateRange(days);
      const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;

      const r = await fetch(url);
      const d = await r.json();

      const raw: Point[] = Object.keys(d.rates || {})
        .map((day) => {
          const rate = d.rates[day][symbol];
          return { time: parseDay(day), value: 1 / rate }; // fiat→USD
        })
        .sort((a, b) => a.time - b.time);

      return smoothFiat(raw, days);
    };

    // ---------------------------------------------
    // Fetch both series
    // ---------------------------------------------
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base) : fetchCrypto(base),
      isFiat(quote) ? fetchFiat(quote) : fetchCrypto(quote),
    ]);

    if (!Araw.length || !Braw.length) {
      return Response.json({ history: [] });
    }

    // ---------------------------------------------
    // CRYPTO/CRYPTO → INDEX MATCHING (industry standard)
    // FIAT pairs still use real timestamps, but ratio is index-aligned
    // ---------------------------------------------
    const N = Math.min(Araw.length, Braw.length);
    const merged: Point[] = [];

    for (let i = 0; i < N; i++) {
      const v = Araw[i].value / Braw[i].value;
      if (!isFinite(v)) continue;

      // Use base's timestamp to preserve consistent time axis
      merged.push({
        time: Araw[i].time,
        value: v,
      });
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
