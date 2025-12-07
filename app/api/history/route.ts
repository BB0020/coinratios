// /app/api/history/route.ts
export const revalidate = 300; // 5 min cache

// -----------------------------
// TYPES
// -----------------------------
interface Point { time: number; value: number; }
interface FrankfurterResponse { rates: Record<string, Record<string, number>>; }
interface CGResponse { prices: [number, number][]; }

// -----------------------------
// FETCH COIN ID MAP (symbol→id)
// -----------------------------
let idCache: { timestamp: number; map: Record<string,string> } | null = null;

async function getIdMap() {
  const now = Date.now();
  if (idCache && now - idCache.timestamp < 15 * 60 * 1000) {
    return idCache.map;
  }

  const url = `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/coins`;
  const r = await fetch(url, { cache: "no-store" });
  const coins = await r.json();

  const map: Record<string,string> = {};
  for (const c of coins) {
    if (c.symbol && c.id) {
      map[c.symbol.toLowerCase()] = c.id.toLowerCase();
    }
  }

  idCache = { timestamp: now, map };
  return map;
}

function resolveId(input: string, ids: Record<string,string>) {
  const key = input.toLowerCase();
  return ids[key] ?? key; // fallback: use provided id directly
}

// -----------------------------
// HELPERS
// -----------------------------
const isFiat = (id: string): boolean => /^[A-Z]{3,5}$/i.test(id);

const parseDay = (day: string): number =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
  return {
    start: start.toISOString().slice(0,10),
    end: end.toISOString().slice(0,10)
  };
}

function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];
  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) / 1000;

  const out: Point[] = [];
  const map = new Map(points.map(p => [p.time, p.value]));
  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }
  return out;
}

// -----------------------------
// FETCH CRYPTO (market_chart)
// -----------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as CGResponse;
  if (!d.prices) return [];

  return d.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price
  }));
}

// -----------------------------
// FETCH FIAT (Frankfurter)
// -----------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  symbol = symbol.toUpperCase();

  if (symbol === "USD") {
    const now = new Date();
    return Array.from({ length: days + 1 }).map((_, i) => ({
      time: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - i)) / 1000,
      value: 1
    }));
  }

  const { start, end } = buildDateRange(days);
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;
  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as FrankfurterResponse;
  if (!d.rates) return [];

  const raw = Object.keys(d.rates)
    .map(day => ({
      time: parseDay(day),
      value: 1 / d.rates[day][symbol]
    }))
    .sort((a,b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -------------------------------------
// NEAREST MATCHER
// -------------------------------------
function nearestFactory(times: number[], values: number[]) {
  return function (t: number): number | null {
    let lo = 0, hi = times.length - 1, best = -1;
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

// -----------------------------
// MAIN HANDLER
// -----------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const base = searchParams.get("base")!;
    const quote = searchParams.get("quote")!;
    const days = Number(searchParams.get("days") ?? 30);

    const idMap = await getIdMap();

    const baseId = resolveId(base, idMap);
    const quoteId = resolveId(quote, idMap);

    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(baseId, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quoteId, days)
    ]);

    if (!Araw.length || !Braw.length) return Response.json({ history: [] });

    const timesB = Braw.map(p => p.time);
    const valuesB = Braw.map(p => p.value);
    const nearest = nearestFactory(timesB, valuesB);

    const merged: Point[] = [];
    for (const p of Araw) {
      const div = nearest(p.time);
      if (div && div !== 0) {
        merged.push({ time: p.time, value: p.value / div });
      }
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
