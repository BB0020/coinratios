// /app/api/history/route.ts
// Clean final version — dynamic ID resolution, correct 24H behavior,
// hourly for ≤90D, 3-hour at 90D, daily for >90D.

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios/1.0",
};

// ------------------------------------------------------
// DYNAMIC SYMBOL → COINGECKO ID RESOLUTION
// ------------------------------------------------------
async function resolveId(symbol: string): Promise<string> {
  const sym = symbol.toLowerCase();

  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/list?include_platform=false",
    { headers: CG_HEADERS }
  );

  if (!res.ok) return sym;

  const list = await res.json();

  // Exact ID match
  let found = list.find((c: any) => c.id.toLowerCase() === sym);
  if (found) return found.id;

  // Match by symbol (btc → bitcoin)
  found = list.find((c: any) => c.symbol.toLowerCase() === sym);
  if (found) return found.id;

  console.warn("CG ID not resolved:", sym);
  return sym;
}

// ------------------------------------------------------
// HOURLY DATA (≤ 90 DAYS) w/ 24H FIX
// ------------------------------------------------------
async function fetchHourly(symbol: string, days: number): Promise<Point[]> {
  const id = await resolveId(symbol);

  const now = Math.floor(Date.now() / 1000);

  // 24H fix: always pull 25 hours minimum
  const from =
    days === 1
      ? now - 25 * 3600
      : now - days * 86400;

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${now}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// ------------------------------------------------------
// 3-HOUR DOWNSAMPLE (ONLY FOR 90D)
// ------------------------------------------------------
function downsample3H(raw: Point[]): Point[] {
  const bucket = 3 * 3600;
  const out = new Map<number, Point>();

  for (const p of raw) {
    const t = Math.floor(p.time / bucket) * bucket;
    out.set(t, p);
  }

  return [...out.entries()]
    .map(([t, p]) => ({ time: t, value: p.value }))
    .sort((a, b) => a.time - b.time);
}

// ------------------------------------------------------
// DAILY FOR > 90D
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

  return j.prices.map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// ------------------------------------------------------
// FIAT DAILY
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
    `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}` +
    `..${end.toISOString().slice(0, 10)}?from=USD&to=${f}`;

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
// MERGE RATIO (A/B)
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
// MAIN HANDLER
// ------------------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    const days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });

    let A: Point[] = [];
    let B: Point[] = [];

    // HOURLY (≤ 90D)
    if (days <= 90) {
      A = isFiat(base) ? await fetchFiat(base, days) : await fetchHourly(base, days);
      B = isFiat(quote) ? await fetchFiat(quote, days) : await fetchHourly(quote, days);

      // 3H for exactly 90D
      if (days === 90) {
        if (!isFiat(base)) A = downsample3H(A);
        if (!isFiat(quote)) B = downsample3H(B);
      }
    }

    // DAILY (> 90D)
    if (days > 90) {
      A = isFiat(base) ? await fetchFiat(base, days) : await fetchDaily(base, days);
      B = isFiat(quote) ? await fetchFiat(quote, days) : await fetchDaily(quote, days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    return Response.json({ history: mergeRatio(A, B) });

  } catch (err) {
    console.error("history API error:", err);
    return Response.json({ history: [] });
  }
}
