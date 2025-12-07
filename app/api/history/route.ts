// /app/api/history/route.ts
// FINAL VERSION — Free-tier CoinGecko compatible
// High-resolution 1D, hourly 2–30D, 3H for 31–90D, daily for >90D

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;   // UNIX seconds
  value: number;
}

interface MarketChart {
  prices: [number, number][];
}

// --------------------------------------------
// FIAT DETECTION
// --------------------------------------------
const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

// --------------------------------------------
// FETCH CRYPTO USING ONLY market_chart (safe)
// --------------------------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return [];

  const j = (await r.json()) as MarketChart;
  if (!j.prices) return [];

  return j.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// --------------------------------------------
// FIAT (Frankfurter)
// --------------------------------------------
function parseDay(day: string): number {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}

function buildDateRange(days: number) {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  // USD baseline = 1
  if (sym === "USD") {
    const now = new Date();
    const arr: Point[] = [];
    for (let i = 0; i <= days; i++) {
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
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${sym}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.rates) return [];

  const raw = Object.keys(j.rates)
    .map((day) => ({
      time: parseDay(day),
      value: 1 / j.rates[day][sym], // convert to fiat→USD
    }))
    .sort((a, b) => a.time - b.time);

  // Smooth missing days
  const out: Point[] = [];
  const map = new Map(raw.map((p) => [p.time, p.value]));

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) /
    1000;

  let last = raw[0]?.value ?? 1;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }

  return out;
}

// --------------------------------------------
// BUCKETING HELPERS (hourly, 3h)
// last tick wins
// --------------------------------------------
function bucketize(raw: Point[], bucketSec: number): Point[] {
  const map = new Map<number, number>();

  for (const p of raw) {
    const bucket = Math.floor(p.time / bucketSec) * bucketSec;
    map.set(bucket, p.value);
  }

  return [...map.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// --------------------------------------------
// MERGE RATIO A/B
// --------------------------------------------
function merge(A: Point[], B: Point[]): Point[] {
  const L = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < L; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) out.push({ time: A[i].time, value: v });
  }

  return out;
}

// --------------------------------------------
// MAIN HANDLER
// --------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    let days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });
    if (!Number.isFinite(days) || days < 1) days = 30;

    const isFiatBase = isFiat(base);
    const isFiatQuote = isFiat(quote);

    // ------------------------------------------
    // 1) FETCH RAW SERIES
    // ------------------------------------------
    const Araw = isFiatBase ? await fetchFiat(base, days) : await fetchCrypto(base, days);
    const Braw = isFiatQuote ? await fetchFiat(quote, days) : await fetchCrypto(quote, days);

    if (!Araw.length || !Braw.length)
      return Response.json({ history: [] });

    // ------------------------------------------
    // 2) RESOLUTION RULES
    // ------------------------------------------

    let A: Point[] = [];
    let B: Point[] = [];

    if (days === 1) {
      // High-resolution raw minute data (200–300 pts)
      A = Araw;
      B = Braw;
    } else if (days <= 30) {
      // Hourly buckets
      A = bucketize(Araw, 3600);
      B = bucketize(Braw, 3600);
    } else if (days <= 90) {
      // 3H buckets
      A = bucketize(Araw, 10800);
      B = bucketize(Braw, 10800);
    } else {
      // Daily (CoinGecko already provides daily for large N)
      A = Araw;
      B = Braw;
    }

    return Response.json({ history: merge(A, B) });
  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return Response.json({ history: [] });
  }
}
