// /app/api/history/route.ts
// FINAL — Accurate hourly (≤30D), 3-hour (≤90D), daily (>90D)
// FIXED: No ID lookup. Input symbol is used directly.

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

// -------------------------------
// COINGECKO HEADERS
// -------------------------------
const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios-app",
};

// -------------------------------
// USE SYMBOL DIRECTLY (NO LOOKUP)
// -------------------------------
function resolveId(symbol: string): string {
  return symbol.toLowerCase();
}

// -------------------------------
// RANGE API FETCH
// -------------------------------
async function fetchRangeRaw(symbol: string, from: number, to: number) {
  const id = resolveId(symbol);

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

// -------------------------------
// DAILY API FETCH (used >90D)
// -------------------------------
async function fetchDaily(symbol: string, days: number): Promise<Point[]> {
  const id = resolveId(symbol);

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: any) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

// -------------------------------
// BUCKET RESAMPLING (LAST WINS)
// bucketSize = 3600 (hour) or 10800 (3h)
// -------------------------------
function bucketize(raw: Point[], bucketSize: number): Point[] {
  const out = new Map<number, number>();

  for (const p of raw) {
    const bucket = Math.floor(p.time / bucketSize) * bucketSize;
    out.set(bucket, p.value);
  }

  return [...out.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// -------------------------------
// FIAT DAILY FETCH
// -------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  if (sym === "USD") {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: days + 1 }).map((_, i) => ({
      time: now - (days - i) * 86400,
      value: 1,
    }));
  }

  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));

  const url =
    `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}..${end
      .toISOString()
      .slice(0, 10)}?from=USD&to=${sym}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();

  return Object.keys(j.rates)
    .map((day) => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[day][sym],
    }))
    .sort((a, b) => a.time - b.time);
}

// -------------------------------
// MERGE RATIO A/B
// -------------------------------
function mergeRatio(A: Point[], B: Point[]): Point[] {
  const L = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < L; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) out.push({ time: A[i].time, value: v });
  }

  return out;
}

// -------------------------------
// MAIN HANDLER
// -------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    let days = parseInt(url.searchParams.get("days") ?? "30", 10);

    if (!base || !quote) return Response.json({ history: [] });
    if (!Number.isFinite(days) || days < 1) days = 30;

    const now = Math.floor(Date.now() / 1000);

    let A: Point[] = [];
    let B: Point[] = [];

    // -----------------------------------------
    // CASE 1: ≤ 30D → HOURLY BUCKETS
    // -----------------------------------------
    if (days <= 30) {
      const from = now - days * 86400;

      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRangeRaw(base, from, now);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRangeRaw(quote, from, now);

      A = bucketize(rawA, 3600);
      B = bucketize(rawB, 3600);
    }

    // -----------------------------------------
    // CASE 2: 31–90D → 3-HOUR BUCKETS
    // -----------------------------------------
    if (days > 30 && days <= 90) {
      const from = now - days * 86400;

      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRangeRaw(base, from, now);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRangeRaw(quote, from, now);

      A = bucketize(rawA, 10800);
      B = bucketize(rawB, 10800);
    }

    // -----------------------------------------
    // CASE 3: > 90D → DAILY RESOLUTION
    // -----------------------------------------
    if (days > 90) {
      A = isFiat(base) ? await fetchFiat(base, days) : await fetchDaily(base, days);
      B = isFiat(quote) ? await fetchFiat(quote, days) : await fetchDaily(quote, days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    const final = mergeRatio(A, B);
    return Response.json({ history: final });

  } catch (err) {
    console.error("API /history error:", err);
    return Response.json({ history: [] });
  }
}
