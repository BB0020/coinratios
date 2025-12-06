// /app/api/history/route.ts
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

// ----------------------------------
// UTILITIES
// ----------------------------------
const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

// Convert YYYY-MM-DD → UTC midnight timestamp
const parseDay = (day: string) =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Build start/end UTC dates for Frankfurter
function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// Fill weekend/holiday gaps
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const out: Point[] = [];
  const now = new Date();

  const startTs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days
  ) / 1000;

  const map = new Map(points.map((p) => [p.time, p.value]));
  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }

  return out;
}

// ----------------------------------
// FETCHERS
// ----------------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetch(url);
  const d = await r.json();

  return (d.prices ?? []).map((p: [number, number]) => ({
    time: Math.floor(p[0] / 1000),
    value: p[1],
  }));
}

async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    // USD baseline series
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
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol.toUpperCase()}`;

  const r = await fetch(url);
  const d = await r.json();

  const raw: Point[] = Object.keys(d.rates || {})
    .map((day) => ({
      time: parseDay(day),
      value: 1 / d.rates[day][symbol.toUpperCase()], // Convert to fiat→USD
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// ----------------------------------
// INDUSTRY STANDARD ALIGNMENT
// Nearest-Past (Last Known Price)
// ----------------------------------
function buildNearestPastLookup(B: Point[]) {
  const times = B.map((p) => p.time);
  const values = B.map((p) => p.value);

  return function getNearestPast(t: number): number | null {
    let lo = 0;
    let hi = times.length - 1;
    let best = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return best === -1 ? null : values[best];
  };
}

// ----------------------------------
// MAIN HANDLER
// ----------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")!.toLowerCase();
    const quote = url.searchParams.get("quote")!.toLowerCase();
    const days = Number(url.searchParams.get("days") ?? 30);

    // 1. Fetch both series in parallel
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base.toUpperCase(), days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote.toUpperCase(), days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length)
      return Response.json({ history: [] });

    // 2. Sort chronologically
    const A = [...Araw].sort((a, b) => a.time - b.time);
    const B = [...Braw].sort((a, b) => a.time - b.time);

    // 3. Nearest-past lookup for B
    const nearestPast = buildNearestPastLookup(B);

    // 4. Build merged ratio series
    const history: Point[] = [];
    for (const p of A) {
      const divisor = nearestPast(p.time);
      if (divisor === null) continue;

      const ratio = p.value / divisor;
      if (!Number.isFinite(ratio)) continue;

      history.push({ time: p.time, value: ratio });
    }

    return Response.json({ history });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}
