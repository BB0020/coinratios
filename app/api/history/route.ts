// /app/api/history/route.ts
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios-app",
};

// ---------------------------------------------
// ID Normalization (must use full CG IDs)
// ---------------------------------------------
function resolveId(symbol: string): string {
  symbol = symbol.toLowerCase();
  if (symbol === "btc") return "bitcoin";
  if (symbol === "eth") return "ethereum";
  if (symbol === "sol") return "solana";
  if (symbol === "ada") return "cardano";
  if (symbol === "bnb") return "binancecoin";
  // fallback — assume the frontend already uses CG ID
  return symbol;
}

const isFiat = (s: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(s.toLowerCase());

// ---------------------------------------------
// RANGE API — only used for 1 day
// ---------------------------------------------
async function fetchRange1D(id: string): Promise<Point[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400;

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${now}`;

  const r = await fetch(url, { headers: CG_HEADERS });
  if (!r.ok) return [];

  const j = await r.json();
  return j.prices.map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// ---------------------------------------------
// MARKET_CHART (hourly or daily)
// ---------------------------------------------
async function fetchMarketChart(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// ---------------------------------------------
// Bucket helper
// ---------------------------------------------
function bucketize(raw: Point[], bucketSec: number): Point[] {
  const map = new Map<number, number>();

  for (const p of raw) {
    const t = Math.floor(p.time / bucketSec) * bucketSec;
    map.set(t, p.value); // last tick wins
  }

  return [...map.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// ---------------------------------------------
// MAIN HANDLER
// ---------------------------------------------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = url.searchParams.get("base")?.toLowerCase();
  const quote = url.searchParams.get("quote")?.toLowerCase();
  let days = Number(url.searchParams.get("days") ?? 30);

  if (!base || !quote) return Response.json({ history: [] });
  if (!Number.isFinite(days) || days < 1) days = 30;

  const now = Math.floor(Date.now() / 1000);

  // Resolve CoinGecko IDs
  const idA = resolveId(base);
  const idB = resolveId(quote);

  let A: Point[] = [];
  let B: Point[] = [];

  // -------------------------
  // 1 DAY → minute-level
  // -------------------------
  if (days === 1) {
    A = await fetchRange1D(idA);
    B = await fetchRange1D(idB);
  }

  // -------------------------
  // 2–30 DAY → hourly
  // -------------------------
  if (days > 1 && days <= 30) {
    A = await fetchMarketChart(idA, days);
    B = await fetchMarketChart(idB, days);

    A = bucketize(A, 3600);
    B = bucketize(B, 3600);
  }

  // -------------------------
  // 31–90 DAY → 3-hour
  // -------------------------
  if (days > 30 && days <= 90) {
    A = await fetchMarketChart(idA, days);
    B = await fetchMarketChart(idB, days);

    A = bucketize(A, 10800);
    B = bucketize(B, 10800);
  }

  // -------------------------
  // >90 DAY → daily (no buckets)
  // -------------------------
  if (days > 90) {
    A = await fetchMarketChart(idA, days);
    B = await fetchMarketChart(idB, days);
  }

  if (!A.length || !B.length) return Response.json({ history: [] });

  // Merge ratio
  const L = Math.min(A.length, B.length);
  const out = [];

  for (let i = 0; i < L; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) {
      out.push({ time: A[i].time, value: v });
    }
  }

  return Response.json({ history: out });
}