// /app/api/history/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 300; // cache 5 minutes

// --------------------------------------
// TYPES
// --------------------------------------
interface Point {
  time: number;
  value: number;
}

const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios-app",
};

// --------------------------------------
// LIVE PRICE (CG simple/price)
// --------------------------------------
async function fetchLivePrice(id: string, quote: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${quote}`;
  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return null;

  const j = await r.json();
  if (!j[id] || !j[id][quote]) return null;

  return Number(j[id][quote]);
}

// --------------------------------------
// RAW RANGE — 5-MINUTE DATA (1D ONLY)
// --------------------------------------
async function fetchRangeRaw(id: string, from: number, to: number): Promise<Point[]> {
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

// --------------------------------------
// HOURLY/Daily (market_chart)
// --------------------------------------
async function fetchMarketChart(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS, cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

// --------------------------------------
// BUCKET (for hourly + 3h)
// --------------------------------------
function bucket(raw: Point[], bucketSec: number): Point[] {
  const out = new Map<number, number>();
  for (const p of raw) {
    const t = Math.floor(p.time / bucketSec) * bucketSec;
    out.set(t, p.value); // last value wins
  }
  return [...out.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

// --------------------------------------
// MAIN ROUTE HANDLER
// --------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase() ?? "usd";
    let days = Number(url.searchParams.get("days") ?? "30");

    if (!base) return Response.json({ history: [] });
    if (!Number.isFinite(days) || days < 1) days = 30;

    const now = Math.floor(Date.now() / 1000);

    let raw: Point[] = [];

    // ----------------------------
    // CASE 1 — 1 DAY => RAW (5m)
    // ----------------------------
    if (days === 1) {
      const from = now - 86400;
      raw = await fetchRangeRaw(base, from, now);
    }

    // ----------------------------
    // CASE 2 — 7D or 30D => HOURLY
    // ----------------------------
    else if (days === 7 || days === 30) {
      const hourly = await fetchMarketChart(base, days);
      raw = bucket(hourly, 3600); // hourly output
    }

    // ----------------------------
    // CASE 3 — 90D => DAILY (CG limitation)
    // ----------------------------
    else if (days === 90) {
      const daily = await fetchMarketChart(base, 90);
      raw = daily; // already 1 point per day
    }

    // ----------------------------
    // CASE 4 — >90 => DAILY
    // ----------------------------
    else {
      const daily = await fetchMarketChart(base, days);
      raw = daily;
    }

    if (!raw.length) return Response.json({ history: [] });

    // -----------------------------------------
    // APPEND CURRENT REAL-TIME PRICE
    // -----------------------------------------
    const live = await fetchLivePrice(base, quote);
    if (live !== null) {
      raw.push({
        time: now,
        value: live,
      });
    }

    // final sort + send
    raw.sort((a, b) => a.time - b.time);

    return Response.json({ history: raw });
  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return Response.json({ history: [] });
  }
}