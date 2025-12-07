// /app/api/history/route.ts

export const dynamic = "force-dynamic"; // Always run on server
export const revalidate = 60;           // ISR cache for 60s

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// Parse YYYY-MM-DD → UTC midnight timestamp
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
    end: end.toISOString().slice(0, 10),
  };
}

// Smooth fiat gaps (Google Finance / Yahoo Finance style)
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
      // Weekend/holiday → repeat last known rate
      out.push({ time: t, value: last });
    }
  }

  return out;
}

// -----------------------------
// FETCH CRYPTO (CoinGecko)
// -----------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();

  return (d.prices ?? []).map((p: [number, number]) => ({
    time: Math.floor(p[0] / 1000),
    value: p[1],
  }));
}

// -----------------------------
// FETCH FIAT (Frankfurter)
// -----------------------------
async function fetchFiat(sym: string, days: number): Promise<Point[]> {
  if (sym === "USD") {
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
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${sym}`;

  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();

  const raw: Point[] = Object.keys(d.rates || {}).map(day => {
    const rate = d.rates[day][sym]; // USD→fiat
    return {
      time: parseDay(day),
      value: 1 / rate, // convert fiat→USD
    };
  }).sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -----------------------------
// MERGE BY INDEX (INDUSTRY STANDARD)
// -----------------------------
function mergeSeries(A: Point[], B: Point[]): Point[] {
  const len = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < len; i++) {
    const ratio = A[i].value / B[i].value;

    if (!Number.isFinite(ratio)) continue;

    // Use A's timestamp (they are same length & aligned)
    out.push({
      time: A[i].time,
      value: ratio,
    });
  }

  return out;
}

// -----------------------------
// MAIN API HANDLER
// -----------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const base = searchParams.get("base")!;
    const quote = searchParams.get("quote")!;
    const days = Number(searchParams.get("days") ?? 30);

    if (!base || !quote) {
      return Response.json({ history: [] });
    }

    // -----------------------------
    // FETCH BOTH SERIES IN PARALLEL
    // -----------------------------
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length) {
      return Response.json({ history: [] });
    }

    // -----------------------------
    // MERGE BY INDEX
    // -----------------------------
    const merged = mergeSeries(Araw, Braw);

    return Response.json({ history: merged });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}