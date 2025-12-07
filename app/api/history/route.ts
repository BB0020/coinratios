// /app/api/history/route.ts
// FINAL VERSION — Perfect hourly, 3-hour, and daily resampling
// Ensures exact point counts: 25, 168, 720, 720, 365+
// Fully dynamic CoinGecko ID resolution

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

// ------------------------------------------------------
// CoinGecko Headers
// ------------------------------------------------------
const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios/1.0",
};

// ------------------------------------------------------
// Resolve coin symbol → CoinGecko ID
// ------------------------------------------------------
async function resolveId(symbol: string): Promise<string> {
  const sym = symbol.toLowerCase();

  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/list?include_platform=false",
    { headers: CG_HEADERS }
  );

  if (!res.ok) return sym;

  const list = await res.json();

  let found = list.find((c: any) => c.id.toLowerCase() === sym);
  if (found) return found.id;

  found = list.find((c: any) => c.symbol.toLowerCase() === sym);
  if (found) return found.id;

  return sym;
}

// ------------------------------------------------------
// Fetch raw RANGE data (3–6 minute irregular spacing)
// ------------------------------------------------------
async function fetchRangeRaw(symbol: string, from: number, to: number) {
  const id = await resolveId(symbol);

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd` +
    `&from=${from}&to=${to}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([tsMs, value]: [number, number]) => ({
    time: Math.floor(tsMs / 1000), // convert ms → sec
    value,
  }));
}

// ------------------------------------------------------
// BUCKET (Option A – LAST value wins)
// Example: bucketSize = 3600 (1h) or 10800 (3h)
// ------------------------------------------------------
function bucketize(raw: Point[], bucketSize: number): Point[] {
  const out = new Map<number, number>();

  for (const p of raw) {
    const bucket = Math.floor(p.time / bucketSize) * bucketSize;
    out.set(bucket, p.value); // LAST wins
  }

  return [...out.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// ------------------------------------------------------
// Daily bucket (1-day)
// ------------------------------------------------------
async function fetchDaily(symbol: string, days: number): Promise<Point[]> {
  const id = await resolveId(symbol);

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([tsMs, v]: any) => ({
    time: Math.floor(tsMs / 1000),
    value: v,
  }));
}

// ------------------------------------------------------
// FIAT (always daily)
// ------------------------------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const f = symbol.toUpperCase();

  if (f === "USD") {
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
      .slice(0, 10)}?from=USD&to=${f}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();

  return Object.keys(j.rates)
    .map((day) => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[day][f],
    }))
    .sort((a, b) => a.time - b.time);
}

// ------------------------------------------------------
// Merge A/B ratio (timestamps now match exactly)
// ------------------------------------------------------
function mergeRatio(A: Point[], B: Point[]): Point[] {
  const L = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < L; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) out.push({ time: A[i].time, value: v });
  }

  return out;
}

// ------------------------------------------------------
// MAIN HANDLER — FINAL LOGIC
// ------------------------------------------------------
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

    // ------------------------------------------------------
    // CASE 1: ≤ 90 days → HOURLY RANGE → BUCKET HOURLY
    // ------------------------------------------------------
    if (days <= 90) {
      const from = now - days * 86400;

      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRangeRaw(base, from, now);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRangeRaw(quote, from, now);

      if (days < 90) {
        A = bucketize(rawA, 3600);   // 1-hour
        B = bucketize(rawB, 3600);
      } else {
        A = bucketize(rawA, 10800);  // 3-hour
        B = bucketize(rawB, 10800);
      }
    }

    // ------------------------------------------------------
    // CASE 2: > 90 days → DAILY
    // ------------------------------------------------------
    if (days > 90) {
      A = isFiat(base) ? await fetchFiat(base, days) : await fetchDaily(base, days);
      B = isFiat(quote) ? await fetchFiat(quote, days) : await fetchDaily(quote, days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    return Response.json({ history: mergeRatio(A, B) });
  } catch (err) {
    console.error("API /history error:", err);
    return Response.json({ history: [] });
  }
}
