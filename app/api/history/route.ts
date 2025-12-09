export const dynamic = "force-dynamic";
export const revalidate = 120;

// ---------------------
// TYPES
// ---------------------
interface Point {
  time: number; // unix seconds
  value: number;
}

interface CGChart {
  prices: [number, number][];
}

// Detect fiat (USD, EUR, GBP…)
const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// ---------------------
// FIAT: Frankfurter
// ---------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  symbol = symbol.toUpperCase();

  // USD → constant 1
  if (symbol === "USD") {
    const now = new Date();
    const pts: Point[] = [];
    for (let i = days; i >= 0; i--) {
      const ts = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - i
      ) / 1000;
      pts.push({ time: ts, value: 1 });
    }
    return pts;
  }

  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.app/${s}..${e}?from=USD&to=${symbol}`;
  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.rates) return [];

  const pts: Point[] = Object.keys(j.rates)
    .map((day) => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[day][symbol], // USD per currency
    }))
    .sort((a, b) => a.time - b.time);

  return pts;
}

// ---------------------
// CRYPTO: CoinGecko market_chart
// ---------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = (await r.json()) as CGChart;
  if (!j.prices) return [];

  return j.prices.map(([ms, v]) => ({
    time: Math.floor(ms / 1000),
    value: v,
  }));
}

// ---------------------
// LIVE PRICE (CoinGecko simple/price)
// ---------------------
async function fetchLivePrice(id: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
  const r = await fetch(url);
  if (!r.ok) return null;

  const j = await r.json();
  const v = j?.[id]?.usd;
  return typeof v === "number" ? v : null;
}

// ROUND DOWN to 3-hour bin
function floorTo3h(ts: number): number {
  return Math.floor(ts / 10800) * 10800;
}

// BIN hourly → every 3 hours
function downsample3h(series: Point[]): Point[] {
  const out: Point[] = [];
  let lastBin = -1;

  for (const p of series) {
    const bucket = floorTo3h(p.time);
    if (bucket !== lastBin) {
      out.push({ time: bucket, value: p.value });
      lastBin = bucket;
    }
  }

  return out;
}

// ---------------------
// MERGE base/quote series
// ---------------------
function mergeRatio(base: Point[], quote: Point[]): Point[] {
  if (!base.length || !quote.length) return [];

  const mapQ = new Map<number, number>();
  quote.forEach((p) => mapQ.set(p.time, p.value));

  const timesQ = [...mapQ.keys()].sort((a, b) => a - b);
  const valsQ = timesQ.map((t) => mapQ.get(t)!);

  // nearest <= t search
  const nearest = (t: number): number | null => {
    let lo = 0,
      hi = timesQ.length - 1,
      best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (timesQ[mid] <= t) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best === -1 ? null : valsQ[best];
  };

  const out: Point[] = [];
  for (const p of base) {
    const qv = nearest(p.time);
    if (qv) out.push({ time: p.time, value: p.value / qv });
  }

  return out;
}

// ---------------------
// MAIN API ROUTE
// ---------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")!.toLowerCase();
    const quote = url.searchParams.get("quote")!.toLowerCase();
    const days = Number(url.searchParams.get("days") ?? 30);

    // ---------------------
    // FETCH BASE & QUOTE
    // ---------------------
    const [rawBase, rawQuote] = await Promise.all([
      isFiat(base.toUpperCase())
        ? fetchFiat(base, days)
        : fetchCrypto(base, days),

      isFiat(quote.toUpperCase())
        ? fetchFiat(quote, days)
        : fetchCrypto(quote, days),
    ]);

    if (!rawBase.length || !rawQuote.length) {
      return Response.json({ history: [] });
    }

    // ---------------------
    // DOWNSAMPLE RULES
    // ---------------------
    let baseSeries = rawBase;
    if (days === 90) {
      baseSeries = downsample3h(baseSeries);
    }

    // ---------------------
    // MERGE INTO RATIO SERIES
    // ---------------------
    let merged = mergeRatio(baseSeries, rawQuote);
    if (!merged.length) return Response.json({ history: [] });

    // ---------------------
    // APPEND LIVE PRICE (Option B)
    // Only for 1D, 7D, 30D, 90D
    // ---------------------
    if (days !== 365) {
      const live = await fetchLivePrice(base);
      if (typeof live === "number") {
        const lastTs = merged[merged.length - 1].time;

        // Round down live timestamp to nearest minute
        const nowSec = Math.floor(Date.now() / 1000);
        const liveTs = nowSec - (nowSec % 60); // truncate

        if (liveTs > lastTs) {
          merged.push({ time: liveTs, value: live });
        }
      }
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}