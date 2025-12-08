// /app/api/history/route.ts
export const revalidate = 300; // 5 minutes

// ---------------------------------------------
// TYPES
// ---------------------------------------------
interface Point {
  time: number;
  value: number;
}

const isFiat = (s: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(
    s.toLowerCase()
  );

// ---------------------------------------------
// COINGECKO HEADERS
// ---------------------------------------------
const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios-app",
};

// ---------------------------------------------
// FETCH RANGE (irregular minute timestamps)
// Used for ≤ 30 days (hourly bucketed)
// ---------------------------------------------
async function fetchRangeRaw(
  id: string,
  vs: string,
  from: number,
  to: number
): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=${vs}&from=${from}&to=${to}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// ---------------------------------------------
// FETCH DAILY (CoinGecko)
// Used for > 90 days
// ---------------------------------------------
async function fetchDaily(id: string, vs: string, days: number) {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=${vs}&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// ---------------------------------------------
// FETCH FIAT (Frankfurter)
// ---------------------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  if (sym === "USD") {
    const now = new Date();
    const out: Point[] = [];
    for (let i = days; i >= 0; i--) {
      const t =
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - i
        ) / 1000;
      out.push({ time: t, value: 1 });
    }
    return out;
  }

  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const url =
    `https://api.frankfurter.app/${start
      .toISOString()
      .slice(0, 10)}..${end.toISOString().slice(0, 10)}?from=USD&to=${sym}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.rates) return [];

  return Object.keys(j.rates)
    .map((day) => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[day][sym],
    }))
    .sort((a, b) => a.time - b.time);
}

// ---------------------------------------------
// BUCKETIZE to 1h or 3h (last sample wins)
// ---------------------------------------------
function bucketize(raw: Point[], sec: number): Point[] {
  const m = new Map<number, number>();
  for (const p of raw) {
    const bucket = Math.floor(p.time / sec) * sec;
    m.set(bucket, p.value);
  }
  return [...m.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// ---------------------------------------------
// MERGE A/B → ratio
// ---------------------------------------------
function mergeRatio(A: Point[], B: Point[]) {
  const out: Point[] = [];
  const L = Math.min(A.length, B.length);

  for (let i = 0; i < L; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) {
      out.push({ time: A[i].time, value: v });
    }
  }

  return out;
}

// ---------------------------------------------
// MAIN HANDLER
// ---------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    let days = Number(url.searchParams.get("days") ?? "30");

    if (!base || !quote) return Response.json({ history: [] });
    if (!Number.isFinite(days) || days < 1) days = 30;

    const now = Math.floor(Date.now() / 1000);

    let A: Point[] = [];
    let B: Point[] = [];

    // -----------------------------------------
    // ≤ 30D → hourly via RANGE
    // -----------------------------------------
    if (days <= 30) {
      const from = now - days * 86400;

      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRangeRaw(base, "usd", from, now);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRangeRaw(quote, "usd", from, now);

      A = bucketize(rawA, 3600);
      B = bucketize(rawB, 3600);
    }

    // -----------------------------------------
    // 31–90D → CoinGecko gives 3h data
    // -----------------------------------------
    else if (days <= 90) {
      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(base, "usd", days);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(quote, "usd", days);

      A = bucketize(rawA, 10800); // 3h buckets
      B = bucketize(rawB, 10800);
    }

    // -----------------------------------------
    // > 90D → daily
    // -----------------------------------------
    else {
      A = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(base, "usd", days);

      B = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(quote, "usd", days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    return Response.json({ history: mergeRatio(A, B) });
  } catch (e) {
    console.error("HISTORY API ERROR:", e);
    return Response.json({ history: [] });
  }
}