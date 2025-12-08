// /app/api/history/route.ts
// Unified history API with correct resolutions + time-aligned merge.
//
// - 1 day  -> bucketed to hourly (~25 pts)
// - 2–30d  -> hourly (CoinGecko auto-granularity)
// - 31–90d -> downsampled to 3h
// - >90d   -> daily
//
// Works for:
//   - crypto/crypto
//   - crypto/fiat (USD, EUR, GBP, CAD, JPY, CHF, AUD)
//   - fiat/fiat   (daily)

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5 min cache

// -----------------------------
// TYPES
// -----------------------------
interface Point {
  time: number; // seconds (unix)
  value: number;
}

interface CGResponse {
  prices: [number, number][];
}

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

// -----------------------------
// CONSTANTS / HELPERS
// -----------------------------
const FIATS = ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"];

const CG_HEADERS: Record<string, string> = {
  accept: "application/json",
  "User-Agent": "coinratios-app",
};

// If you set CG_KEY in .env.local, include it:
if (process.env.CG_KEY) {
  CG_HEADERS["x-cg-api-key"] = process.env.CG_KEY;
}

function isFiat(id: string): boolean {
  return FIATS.includes(id.toLowerCase());
}

function parseDay(day: string): number {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}

function buildDateRange(days: number): { start: string; end: string } {
  const now = new Date();

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

// Smooth fiat missing days (weekends/holidays)
function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) /
    1000;

  const out: Point[] = [];
  const map = new Map<number, number>();
  points.forEach((p) => map.set(p.time, p.value));

  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) {
      last = map.get(t)!;
    }
    out.push({ time: t, value: last });
  }

  return out;
}

// Generic bucketizer: bucketSize in seconds (e.g. 3600 for 1h, 10800 for 3h)
function bucketize(raw: Point[], bucketSize: number): Point[] {
  if (!raw.length) return [];

  const map = new Map<number, number>(); // last sample wins per bucket

  for (const p of raw) {
    const bucket = Math.floor(p.time / bucketSize) * bucketSize;
    map.set(bucket, p.value);
  }

  return [...map.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// -----------------------------
// FETCH CRYPTO (CoinGecko /market_chart)
// -----------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  // Use CoinGecko auto granularity:
  // - 1 day  -> 5-minute
  // - 1–90d -> hourly
  // - >90d   -> daily
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const d = (await r.json()) as CGResponse;
  if (!d.prices) return [];

  const raw: Point[] = d.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));

  // 1d: compress 5m -> hourly
  if (days <= 1) {
    return bucketize(raw, 3600);
  }

  // 2–30d: CoinGecko already hourly; bucketize is basically a no-op
  if (days <= 30) {
    return bucketize(raw, 3600);
  }

  // 31–90d: downsample to 3h
  if (days <= 90) {
    return bucketize(raw, 10800);
  }

  // >90d: CoinGecko gives daily already, keep as-is
  return raw;
}

// -----------------------------
// FETCH FIAT (Frankfurter)
// -----------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  // Special case: USD baseline
  if (sym === "USD") {
    const now = new Date();
    const arr: Point[] = [];
    for (let i = 0; i <= days; i++) {
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
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${sym}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as FrankfurterResponse;
  if (!d.rates) return [];

  const raw: Point[] = Object.keys(d.rates)
    .map((day) => ({
      time: parseDay(day),
      value: 1 / d.rates[day][sym], // convert to fiat→USD
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -------------------------------------
// NEAREST-TIME MERGE (A / B)
// -------------------------------------
function nearestTimeFactory(times: number[], values: number[]) {
  return function (t: number): number | null {
    let lo = 0;
    let hi = times.length - 1;
    let bestIndex = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        bestIndex = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return bestIndex === -1 ? null : values[bestIndex];
  };
}

function mergeByTime(A: Point[], B: Point[]): Point[] {
  if (!A.length || !B.length) return [];

  const timesB = B.map((p) => p.time);
  const valuesB = B.map((p) => p.value);
  const nearest = nearestTimeFactory(timesB, valuesB);

  const merged: Point[] = [];

  for (const p of A) {
    const div = nearest(p.time);
    if (div === null || div === 0 || !Number.isFinite(div)) continue;

    const v = p.value / div;
    if (!Number.isFinite(v)) continue;

    merged.push({
      time: p.time,
      value: v,
    });
  }

  return merged;
}

// -----------------------------
// MAIN ROUTE HANDLER
// -----------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawBase = searchParams.get("base");
    const rawQuote = searchParams.get("quote");
    let days = Number(searchParams.get("days") ?? 30);

    if (!rawBase || !rawQuote) {
      return Response.json({ history: [] });
    }

    if (!Number.isFinite(days) || days < 1) days = 30;
    if (days > 365) days = 365;

    const base = rawBase.toLowerCase();
    const quote = rawQuote.toLowerCase();

    // Shortcut: base / usd = just base price
    if (!isFiat(base) && quote === "usd") {
      const series = await fetchCrypto(base, days);
      return Response.json({ history: series });
    }

    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length) {
      return Response.json({ history: [] });
    }

    const merged = mergeByTime(Araw, Braw);
    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}