// /app/api/history/route.ts
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const FIAT = ["USD", "EUR", "GBP", "CAD", "JPY", "CHF", "AUD"];

const isFiat = (id: string) => FIAT.includes(id.toUpperCase());

// ------------------------------
// 1. Fetch Crypto History (CoinGecko)
// ------------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  if (!data.prices) return [];

  return data.prices.map((p: [number, number]) => ({
    time: Math.floor(p[0] / 1000),
    value: p[1],
  }));
}

// ------------------------------
// 2. Fetch Fiat History (Frankfurter)
// ------------------------------
function parseDay(day: string) {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}

function buildDateRange(days: number) {
  const now = new Date();

  const endDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const startDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

  return {
    start: startDay.toISOString().slice(0, 10),
    end: endDay.toISOString().slice(0, 10),
  };
}

async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    // USD baseline = always 1 for price in USD terms
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
  const res = await fetch(url);
  const data = await res.json();

  let raw: Point[] = Object.keys(data.rates || {})
    .map((day) => {
      const rate = data.rates[day][symbol]; // USD→fiat
      return {
        time: parseDay(day),
        value: 1 / rate, // convert fiat→USD
      };
    })
    .sort((a, b) => a.time - b.time);

  // Smooth missing days (weekends)
  const smoothed: Point[] = [];
  let last = raw.length ? raw[0].value : 1;

  const startTs = raw.length ? raw[0].time : 0;
  const expectedEnd = startTs + days * 86400;

  const map = new Map(raw.map((p) => [p.time, p.value]));

  for (let t = startTs; t <= expectedEnd; t += 86400) {
    if (map.has(t)) {
      last = map.get(t)!;
      smoothed.push({ time: t, value: last });
    } else {
      smoothed.push({ time: t, value: last });
    }
  }

  return smoothed;
}

// ------------------------------
// 3. LINEAR INTERPOLATION RESAMPLING
// ------------------------------
function linearResample(points: Point[], targetLength: number): Point[] {
  if (points.length === targetLength) return points;

  const out: Point[] = [];
  const n = points.length;

  for (let i = 0; i < targetLength; i++) {
    const t = (i / (targetLength - 1)) * (n - 1);

    const i0 = Math.floor(t);
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = t - i0;

    const v = points[i0].value * (1 - frac) + points[i1].value * frac;
    const time = Math.floor(
      points[i0].time * (1 - frac) + points[i1].time * frac
    );

    out.push({ time, value: v });
  }

  return out;
}

// ------------------------------
// MAIN HANDLER
// ------------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const base = searchParams.get("base")!;
    const quote = searchParams.get("quote")!;
    const days = Number(searchParams.get("days") || 30);

    if (!base || !quote) return Response.json({ history: [] });

    // Fetch both series in parallel
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length)
      return Response.json({ history: [] });

    // RESAMPLE BOTH TO MATCH MAX LENGTH
    const N = Math.max(Araw.length, Braw.length);

    const A = linearResample(Araw, N);
    const B = linearResample(Braw, N);

    const history = A.map((p, i) => ({
      time: p.time,
      value: p.value / B[i].value,
    }));

    return Response.json({ history });
  } catch (err) {
    console.error("History API Error:", err);
    return Response.json({ history: [] });
  }
}
