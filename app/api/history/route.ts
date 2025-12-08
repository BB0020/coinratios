export const dynamic = "force-dynamic";
export const revalidate = 300;

// -----------------------------------------
// TYPES
// -----------------------------------------
interface Point {
  time: number;
  value: number;
}

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

interface CGResponse {
  prices: [number, number][];
}

// -----------------------------------------
// HELPERS
// -----------------------------------------
const isFiat = (x: string): boolean => /^[A-Z]{3,5}$/.test(x);

// Convert YYYY-MM-DD to UNIX
const parseDay = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

// Build date range for fiat query
function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// Smooth missing fiat days
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) / 1000;

  const map = new Map<number, number>();
  points.forEach((p) => map.set(p.time, p.value));

  const out: Point[] = [];
  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }

  return out;
}

// -----------------------------------------
// 🔍 NEW: Symbol → CoinGecko ID resolver (Option A)
// -----------------------------------------
async function resolveToCGID(input: string): Promise<string | null> {
  const baseURL = process.env.NEXT_PUBLIC_BASE_URL || "";
  const r = await fetch(`${baseURL}/api/coins`, { next: { revalidate: 3600 } });

  if (!r.ok) return null;
  const data = await r.json();
  const coins = data.coins || [];

  const upper = input.toUpperCase();

  // Match by SYMBOL first (ETH → ethereum)
  const bySymbol = coins.find((c: any) => c.symbol === upper);
  if (bySymbol) return bySymbol.id;

  // Match by ID (bitcoin → bitcoin)
  const byID = coins.find(
    (c: any) => c.id.toLowerCase() === input.toLowerCase()
  );
  if (byID) return byID.id;

  return null;
}

// -----------------------------------------
// Crypto fetch
// -----------------------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as CGResponse;
  if (!d.prices) return [];

  return d.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// -----------------------------------------
// Fiat fetch
// -----------------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  // USD → constant 1
  if (symbol === "USD") {
    const now = new Date();
    const arr: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const ts =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i) /
        1000;
      arr.push({ time: ts, value: 1 });
    }
    return arr.reverse();
  }

  const { start, end } = buildDateRange(days);
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as FrankfurterResponse;
  if (!d.rates) return [];

  const raw: Point[] = Object.keys(d.rates)
    .map((day) => ({
      time: parseDay(day),
      value: 1 / d.rates[day][symbol],
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -----------------------------------------
// Nearest-timestamp match
// -----------------------------------------
function nearestTimeFactory(times: number[], values: number[]) {
  return function (t: number): number | null {
    let lo = 0;
    let hi = times.length - 1;
    let best = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }

    return best === -1 ? null : values[best];
  };
}

// -----------------------------------------
// MAIN HANDLER
// -----------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const baseRaw = url.searchParams.get("base")!;
    const quoteRaw = url.searchParams.get("quote")!;
    const days = Number(url.searchParams.get("days") ?? 30);

    // Resolve crypto IDs via Option A
    const baseIsFiat = isFiat(baseRaw);
    const quoteIsFiat = isFiat(quoteRaw);

    const baseID = baseIsFiat ? baseRaw : await resolveToCGID(baseRaw);
    const quoteID = quoteIsFiat ? quoteRaw : await resolveToCGID(quoteRaw);

    if (!baseID || !quoteID) {
      return Response.json({ history: [] });
    }

    // Fetch series
    const [rawA, rawB] = await Promise.all([
      baseIsFiat ? fetchFiat(baseID, days) : fetchCrypto(baseID, days),
      quoteIsFiat ? fetchFiat(quoteID, days) : fetchCrypto(quoteID, days),
    ]);

    if (!rawA.length || !rawB.length) return Response.json({ history: [] });

    // Downsample 90D → 3H (720 → 240 points) *optional*
    let seriesA = rawA;
    let seriesB = rawB;

    if (days === 90) {
      seriesA = rawA.filter((_, i) => i % 3 === 0);
      seriesB = rawB.filter((_, i) => i % 3 === 0);
    }

    // Merge by nearest match
    const timesB = seriesB.map((p) => p.time);
    const valuesB = seriesB.map((p) => p.value);
    const nearest = nearestTimeFactory(timesB, valuesB);

    const merged: Point[] = [];
    for (const p of seriesA) {
      const div = nearest(p.time);
      if (div) merged.push({ time: p.time, value: p.value / div });
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API Error:", err);
    return Response.json({ history: [] });
  }
}