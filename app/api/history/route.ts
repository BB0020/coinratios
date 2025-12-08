// /app/api/history/route.ts
// FINAL — Option B (direct import of /api/coins)
// Full working version for 1D–365D

export const dynamic = "force-dynamic";
export const revalidate = 300;

import { GET as CoinsGET } from "../coins/route";

interface Point { time: number; value: number; }
interface CGResp { prices: [number, number][]; }

// -----------------------------
// Load Coin List (direct import)
// -----------------------------
async function loadCoinMap(): Promise<Record<string, string>> {
  const res = await CoinsGET();
  const { coins } = await res.json();

  const map: Record<string, string> = {};

  for (const c of coins) {
    const sym = c.symbol.toUpperCase();
    if (!map[sym]) map[sym] = c.id; // keep first match
    if (c.name && !map[c.name.toUpperCase()]) map[c.name.toUpperCase()] = c.id;
  }

  // Also add lowercase variants
  const out: Record<string, string> = {};
  Object.keys(map).forEach(k => out[k.toLowerCase()] = map[k]);
  return out;
}

// -----------------------------
// FIAT TEST
// -----------------------------
const FIATS = new Set(["usd", "eur", "gbp", "cad", "aud", "jpy", "chf"]);

const isFiat = (x: string) => FIATS.has(x.toLowerCase());

// Smooth FIAT missing days
function smoothFiat(arr: Point[], days: number): Point[] {
  if (!arr.length) return [];
  const now = new Date();
  const start =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) /
    1000;

  const map = new Map(arr.map(p => [p.time, p.value]));
  let last = arr[0].value;

  const out: Point[] = [];
  for (let i = 0; i <= days; i++) {
    const ts = start + i * 86400;
    if (map.has(ts)) last = map.get(ts)!;
    out.push({ time: ts, value: last });
  }
  return out;
}

// -----------------------------
// FETCH FIAT
// -----------------------------
async function fetchFiat(sym: string, days: number): Promise<Point[]> {
  const S = sym.toUpperCase();

  if (S === "USD") {
    const now = new Date();
    return Array.from({ length: days + 1 }).map((_, i) => ({
      time:
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - (days - i)
        ) / 1000,
      value: 1,
    }));
  }

  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));

  const url =
    `https://api.frankfurter.app/${start.toISOString().slice(0, 10)}..` +
    `${end.toISOString().slice(0, 10)}?from=USD&to=${S}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();

  const raw = Object.keys(j.rates)
    .map(day => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[day][S]
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// -----------------------------
// FETCH CRYPTO — RANGE (minute granularity)
// -----------------------------
async function fetchRange(id: string, from: number, to: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// -----------------------------
// FETCH CRYPTO — DAILY endpoint
// -----------------------------
async function fetchDaily(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = (await r.json()) as CGResp;
  if (!j.prices) return [];

  return j.prices.map(([ts, v]) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// -----------------------------
// BUCKET HELPERS
// -----------------------------
function bucket(raw: Point[], sec: number): Point[] {
  const map = new Map<number, number>();
  for (const p of raw) {
    const key = Math.floor(p.time / sec) * sec;
    map.set(key, p.value); // last tick in bucket
  }
  return [...map.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// -----------------------------
// MERGE A/B
// -----------------------------
function mergeRatio(A: Point[], B: Point[]): Point[] {
  const L = Math.min(A.length, B.length);
  const out: Point[] = [];
  for (let i = 0; i < L; i++) {
    if (B[i].value === 0) continue;
    out.push({ time: A[i].time, value: A[i].value / B[i].value });
  }
  return out;
}

// -----------------------------
// MAIN HANDLER
// -----------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    let days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });
    if (!Number.isFinite(days) || days < 1) days = 30;

    // Load coin ID mapping dynamically
    const coinMap = await loadCoinMap();

    const resolve = (x: string) => coinMap[x.toLowerCase()] ?? null;

    const now = Math.floor(Date.now() / 1000);

    let A: Point[] = [];
    let B: Point[] = [];

    // -----------------------------
    // 1D — RAW MINUTE DATA
    // -----------------------------
    if (days === 1) {
      const from = now - 86400;

      const ida = isFiat(base) ? null : resolve(base);
      const idb = isFiat(quote) ? null : resolve(quote);

      A = isFiat(base)
        ? await fetchFiat(base, 1)
        : await fetchRange(ida!, from, now);

      B = isFiat(quote)
        ? await fetchFiat(quote, 1)
        : await fetchRange(idb!, from, now);

      return Response.json({ history: mergeRatio(A, B) });
    }

    // -----------------------------
    // 2–30D → HOURLY
    // -----------------------------
    if (days <= 30) {
      const ida = isFiat(base) ? null : resolve(base);
      const idb = isFiat(quote) ? null : resolve(quote);

      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(ida!, days);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(idb!, days);

      A = bucket(rawA, 3600);
      B = bucket(rawB, 3600);

      return Response.json({ history: mergeRatio(A, B) });
    }

    // -----------------------------
    // 31–90D → 3-HOUR
    // -----------------------------
    if (days <= 90) {
      const ida = isFiat(base) ? null : resolve(base);
      const idb = isFiat(quote) ? null : resolve(quote);

      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(ida!, days);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(idb!, days);

      A = bucket(rawA, 10800);
      B = bucket(rawB, 10800);

      return Response.json({ history: mergeRatio(A, B) });
    }

    // -----------------------------
    // >90D → DAILY
    // -----------------------------
    {
      const ida = isFiat(base) ? null : resolve(base);
      const idb = isFiat(quote) ? null : resolve(quote);

      A = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(ida!, days);

      B = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(idb!, days);

      return Response.json({ history: mergeRatio(A, B) });
    }
  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return Response.json({ history: [] });
  }
}