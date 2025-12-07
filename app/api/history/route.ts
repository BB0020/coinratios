// /app/api/history/route.ts
// Restored working version: RANGE for ≤90D, DAILY for >90D

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const isFiat = (x: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(x.toLowerCase());

// ---------------------------------------------
// ADD YOUR KEY
// ---------------------------------------------
const CG_HEADERS: Record<string, string> = {
  accept: "application/json",
  "User-Agent": "coinratios-app",
};

if (process.env.CG_KEY) {
  CG_HEADERS["x-cg-api-key"] = process.env.CG_KEY;
}

// ---------------------------------------------
// ID MAPPING — minimal + correct
// ---------------------------------------------
function resolveId(sym: string): string {
  const id = sym.toLowerCase();
  const map: Record<string, string> = {
    btc: "bitcoin",
    eth: "ethereum",
    sol: "solana",
    xrp: "ripple",
    bnb: "binancecoin",
    ada: "cardano",
    doge: "dogecoin",
    dot: "polkadot",
    link: "chainlink",
    avax: "avalanche-2",
    matic: "polygon",
    ltc: "litecoin",
    uni: "uniswap",
  };
  return map[id] ?? id;
}

// ---------------------------------------------
// RANGE-BASED HOURLY (24H, 7D, 30D, 90D)
// ---------------------------------------------
async function fetchRange(id: string, from: number, to: number) {
  const cgId = resolveId(id);

  const url =
    `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });

  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: any) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

// ---------------------------------------------
// DAILY (>90D)
// ---------------------------------------------
async function fetchDaily(id: string, days: number): Promise<Point[]> {
  const cgId = resolveId(id);

  const url =
    `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();

  return (j.prices || []).map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// ---------------------------------------------
// FIAT (daily only)
// ---------------------------------------------
async function fetchFiat(sym: string, days: number): Promise<Point[]> {
  sym = sym.toUpperCase();

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
    `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}..` +
    `${end.toISOString().slice(0, 10)}?from=USD&to=${sym}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();

  return Object.keys(j.rates).map((day) => ({
    time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
    value: 1 / j.rates[day][sym],
  }));
}

// ---------------------------------------------
// MERGE A/B — index aligned
// ---------------------------------------------
function merge(A: Point[], B: Point[]) {
  const len = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < len; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) out.push({ time: A[i].time, value: v });
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
    let days = Number(url.searchParams.get("days"));

    if (!Number.isFinite(days) || days < 1) days = 1;

    if (!base || !quote) return Response.json({ history: [] });

    const now = Math.floor(Date.now() / 1000);

    let A: Point[] = [];
    let B: Point[] = [];

    // -----------------------------------------
    // ≤ 90D → HOURLY RANGE DATA
    // -----------------------------------------
    if (days <= 90) {
      const from = now - days * 86400;

      A = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRange(base, from, now);

      B = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRange(quote, from, now);
    }

    // -----------------------------------------
    // > 90D → DAILY DATA
    // -----------------------------------------
    if (days > 90) {
      A = isFiat(base) ? await fetchFiat(base, days) : await fetchDaily(base, days);
      B = isFiat(quote) ? await fetchFiat(quote, days) : await fetchDaily(quote, days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    return Response.json({ history: merge(A, B) });

  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return Response.json({ history: [] });
  }
}
