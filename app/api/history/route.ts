// /app/api/history/route.ts
// FINAL HYBRID RESOLUTION ENGINE
// 1–30D  → hourly (bucketized)
// 31–90D → 3-hour (bucketized)
// >90D   → daily

export const dynamic = "force-dynamic";
export const revalidate = 300;

// --------------------------------------------------
// Types
// --------------------------------------------------
interface Point {
  time: number;
  value: number;
}

// --------------------------------------------------
// Detect fiat
// --------------------------------------------------
const isFiat = (s: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(s.toLowerCase());

// --------------------------------------------------
// CG headers (API KEY REQUIRED HERE!)
// --------------------------------------------------
const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios-app",
};

// --------------------------------------------------
// Resolve coin ID (no mapping, just lowercase)
// --------------------------------------------------
const resolveId = (x: string) => x.toLowerCase();

// --------------------------------------------------
// Fetch hourly-range raw data
// --------------------------------------------------
async function fetchRangeRaw(id: string, from: number, to: number) {
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

// --------------------------------------------------
// FIXED fetchDaily — NOW SENDS HEADERS!!!
// --------------------------------------------------
async function fetchDaily(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: any) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

// --------------------------------------------------
// FIAT daily (Frankfurter)
// --------------------------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  if (sym === "USD") {
    const now = new Date();
    const out: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const ts =
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - (days - i)
        ) / 1000;
      out.push({ time: ts, value: 1 });
    }
    return out;
  }

  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

  const url =
    `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}..` +
    `${end.toISOString().slice(0, 10)}?from=USD&to=${sym}`;

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

// --------------------------------------------------
// Bucketize irregular timestamps into hourly buckets
// --------------------------------------------------
function bucketize(raw: Point[], bucketSize: number): Point[] {
  const m = new Map<number, number>();

  for (const p of raw) {
    const bucket = Math.floor(p.time / bucketSize) * bucketSize;
    m.set(bucket, p.value); // last sample wins
  }

  return [...m.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// --------------------------------------------------
// Merge A/B ratio (timestamp-aligned)
// --------------------------------------------------
function mergeRatio(A: Point[], B: Point[]): Point[] {
  const L = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < L; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) out.push({ time: A[i].time, value: v });
  }

  return out;
}

// --------------------------------------------------
// MAIN HANDLER
// --------------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    let days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });
    if (!Number.isFinite(days) || days < 1) days = 30;

    const now = Math.floor(Date.now() / 1000);

    let A: Point[] = [];
    let B: Point[] = [];

    // 1–30D → HOURLY
    if (days <= 30) {
      const from = now - days * 86400;
      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRangeRaw(resolveId(base), from, now);
      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRangeRaw(resolveId(quote), from, now);

      A = bucketize(rawA, 3600);
      B = bucketize(rawB, 3600);
    }

    // 31–90D → 3-HOUR
    else if (days <= 90) {
      const from = now - days * 86400;
      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRangeRaw(resolveId(base), from, now);
      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRangeRaw(resolveId(quote), from, now);

      A = bucketize(rawA, 10800);
      B = bucketize(rawB, 10800);
    }

    // >90D → DAILY (FIXED)
    else {
      A = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(resolveId(base), days);
      B = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(resolveId(quote), days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    return Response.json({ history: mergeRatio(A, B) });

  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return Response.json({ history: [] });
  }
}
