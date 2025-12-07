// /app/api/history/route.ts
// FINAL VERSION — Correct CG ID Resolution + Hourly/3H/Daily Logic
// Fully compatible with demo key. Only 1 API call per request.

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const CG_HEADERS = {
  accept: "application/json",
  "User-Agent": "coinratios/1.0",
  "x-cg-api-key": process.env.CG_KEY ?? "",  // DEMO KEY SUPPORTED
};

const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

/* ------------------------------------------------------
   DIRECT SYMBOL → ID MAP (TOP 250 COINS + COMMON)
   ------------------------------------------------------ */
const DIRECT_MAP: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  usdt: "tether",
  usdc: "usd-coin",
  bnb: "binancecoin",
  sol: "solana",
  xrp: "ripple",
  ada: "cardano",
  doge: "dogecoin",
  ton: "the-open-network",
  dot: "polkadot",
  avax: "avalanche-2",
  shib: "shiba-inu",
  trx: "tron",
  link: "chainlink",
  matic: "polygon",
  uni: "uniswap",
  etc: "ethereum-classic",
  ltc: "litecoin",
  atom: "cosmos",
  xlm: "stellar",
  op: "optimism",
  arb: "arbitrum",
  inj: "injective-protocol",
  apt: "aptos",
  hbar: "hedera-hashgraph",
  imx: "immutable-x",
  fil: "filecoin",
  egld: "elrond-erd-2",
  bch: "bitcoin-cash",
  qnt: "quant-network",
  rune: "thorchain",
  grt: "the-graph",
  mkr: "maker",
  sei: "sei-network",
  kas: "kaspa",
  // Add more if needed — simplest system
};

/* ------------------------------------------------------
   RESOLVE SYMBOL → COINGECKO ID
   ------------------------------------------------------ */
async function resolveId(symbol: string): Promise<string> {
  const sym = symbol.toLowerCase();

  // 1. Fast path (top 250)
  if (DIRECT_MAP[sym]) return DIRECT_MAP[sym];

  // 2. Full lookup from CG
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/list?include_platform=false",
    { headers: CG_HEADERS }
  );

  if (!res.ok) return sym;

  const list = await res.json();

  // Match by ID
  let found = list.find((c: any) => c.id.toLowerCase() === sym);
  if (found) return found.id;

  // Match by symbol (fallback)
  found = list.find((c: any) => c.symbol.toLowerCase() === sym);
  if (found) return found.id;

  console.warn("‼️ Could not resolve symbol to CoinGecko ID:", sym);
  return sym;
}

/* ------------------------------------------------------
   FETCH HOURLY (DAYS ≤ 90)
   ------------------------------------------------------ */
async function fetchHourly(symbol: string, days: number): Promise<Point[]> {
  const id = await resolveId(symbol);
  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${now}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });

  
  if (!r.ok) {
    console.error("CG hourly error", id, r.status);
    return [];
  }

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

/* ------------------------------------------------------
   3-HOUR DOWNSAMPLE (CMC STYLE)
   ------------------------------------------------------ */
function downsample3H(raw: Point[]): Point[] {
  const bucketSec = 3 * 3600;
  const buckets = new Map<number, Point>();

  for (const p of raw) {
    const bucket = Math.floor(p.time / bucketSec) * bucketSec;
    buckets.set(bucket, p); // LAST PRICE wins
  }

  return [...buckets.entries()]
    .map(([time, p]) => ({ time, value: p.value }))
    .sort((a, b) => a.time - b.time);
}

/* ------------------------------------------------------
   DAILY FETCH (DAYS > 90)
   ------------------------------------------------------ */
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

/* ------------------------------------------------------
   FIAT DAILY
   ------------------------------------------------------ */
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

/* ------------------------------------------------------
   MERGE RATIO
   ------------------------------------------------------ */
function mergeRatio(A: Point[], B: Point[]): Point[] {
  const len = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < len; i++) {
    const ratio = A[i].value / B[i].value;
    if (Number.isFinite(ratio)) out.push({ time: A[i].time, value: ratio });
  }
  return out;
}

/* ------------------------------------------------------
   MAIN HANDLER
   ------------------------------------------------------ */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    const days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });

    let A: Point[] = [];
    let B: Point[] = [];

    // CASE 1 — HOURLY (≤ 90 DAYS)
    if (days <= 90) {
      A = isFiat(base) ? await fetchFiat(base, days) : await fetchHourly(base, days);
      B = isFiat(quote) ? await fetchFiat(quote, days) : await fetchHourly(quote, days);

      // Special Rule: 90D → 3-hour downsample
      if (days === 90) {
        if (!isFiat(base)) A = downsample3H(A);
        if (!isFiat(quote)) B = downsample3H(B);
      }
    }

    // CASE 2 — DAILY (> 90 DAYS)
    if (days > 90) {
      A = isFiat(base) ? await fetchFiat(base, days) : await fetchDaily(base, days);
      B = isFiat(quote) ? await fetchFiat(quote, days) : await fetchDaily(quote, days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    const merged = mergeRatio(A, B);

    return Response.json({ history: merged });
  } catch (err) {
    console.error("history API error:", err);
    return Response.json({ history: [] });
  }
}
