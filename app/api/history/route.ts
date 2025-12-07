// /app/api/history/route.ts
// FULL WORKING VERSION — Option 2 caching (15 minutes)

export const dynamic = "force-dynamic";
export const revalidate = 0;

// -------------------------
// Types
// -------------------------
interface Point {
  time: number;
  value: number;
}

// -------------------------
// Local 15-minute cache for coin ID map
// -------------------------
let coinCache: {
  timestamp: number;
  map: Record<string, string>;
} | null = null;

async function getCoinIdMap() {
  const now = Date.now();

  // 15 min cache window (900k ms)
  if (coinCache && now - coinCache.timestamp < 900_000) {
    return coinCache.map;
  }

  // Fetch from your own API (local call, NOT CoinGecko)
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/coins`, {
    cache: "no-store",
  });

  const coins = await r.json();

  const map: Record<string, string> = {};
  for (const c of coins) {
    if (!c.symbol || !c.id) continue;
    map[c.symbol.toLowerCase()] = c.id.toLowerCase();
  }

  coinCache = { timestamp: now, map };
  return map;
}

// -------------------------
// CoinGecko helpers
// -------------------------
const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
};

// RANGE (raw minute data)
async function fetchRangeRaw(id: string, from: number, to: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, price]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// DAILY (safe for >90D)
async function fetchDaily(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, price]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// -------------------------
// FIAT (Frankfurter) — daily only
// -------------------------
async function fetchFiat(sym: string, days: number): Promise<Point[]> {
  sym = sym.toUpperCase();

  if (sym === "USD") {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: days + 1 }).map((_, i) => ({
      time: now - (days - i) * 86400,
      value: 1,
    }));
  }

  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days));

  const r = await fetch(
    `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}..${end
      .toISOString()
      .slice(0, 10)}?from=USD&to=${sym}`
  );
  if (!r.ok) return [];

  const j = await r.json();

  return Object.keys(j.rates)
    .map((day) => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[day][sym],
    }))
    .sort((a, b) => a.time - b.time);
}

// -------------------------
// Bucketizer
// -------------------------
function bucketize(raw: Point[], bucketSizeSec: number): Point[] {
  const map = new Map<number, number>();

  for (const p of raw) {
    const bucket = Math.floor(p.time / bucketSizeSec) * bucketSizeSec;
    map.set(bucket, p.value);
  }

  return [...map.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// -------------------------
// Merge A/B
// -------------------------
function merge(A: Point[], B: Point[]): Point[] {
  const L = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < L; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) out.push({ time: A[i].time, value: v });
  }

  return out;
}

// -------------------------
// MAIN HANDLER
// -------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const baseSymbol = url.searchParams.get("base")?.toLowerCase() ?? "";
    const quoteSymbol = url.searchParams.get("quote")?.toLowerCase() ?? "";
    let days = Number(url.searchParams.get("days") ?? 30);
    if (!Number.isFinite(days) || days < 1) days = 30;

    const idMap = await getCoinIdMap();

    const baseId = idMap[baseSymbol] ?? baseSymbol;
    const quoteId = idMap[quoteSymbol] ?? quoteSymbol;

    const now = Math.floor(Date.now() / 1000);

    let A: Point[] = [];
    let B: Point[] = [];

    const isFiat = (s: string) => /^[a-z]{3,5}$/.test(s);

    // 1–7D → raw minute → hourly
    if (days <= 7) {
      const from = now - days * 86400;
      A = isFiat(baseSymbol)
        ? await fetchFiat(baseSymbol, days)
        : await fetchRangeRaw(baseId, from, now);

      B = isFiat(quoteSymbol)
        ? await fetchFiat(quoteSymbol, days)
        : await fetchRangeRaw(quoteId, from, now);

      A = bucketize(A, 3600);
      B = bucketize(B, 3600);
    }
    // 8–30D → hourly via market_chart
    else if (days <= 30) {
      A = isFiat(baseSymbol) ? await fetchFiat(baseSymbol, days) : await fetchDaily(baseId, days);
      B = isFiat(quoteSymbol) ? await fetchFiat(quoteSymbol, days) : await fetchDaily(quoteId, days);
    }
    // 31–90D → 3-hour
    else if (days <= 90) {
      const from = now - days * 86400;
      A = isFiat(baseSymbol)
        ? await fetchFiat(baseSymbol, days)
        : await fetchRangeRaw(baseId, from, now);

      B = isFiat(quoteSymbol)
        ? await fetchFiat(quoteSymbol, days)
        : await fetchRangeRaw(quoteId, from, now);

      A = bucketize(A, 10800);
      B = bucketize(B, 10800);
    }
    // >90D → daily
    else {
      A = isFiat(baseSymbol) ? await fetchFiat(baseSymbol, days) : await fetchDaily(baseId, days);
      B = isFiat(quoteSymbol) ? await fetchFiat(quoteSymbol, days) : await fetchDaily(quoteId, days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    return Response.json({ history: merge(A, B) });
  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return Response.json({ history: [] });
  }
}
