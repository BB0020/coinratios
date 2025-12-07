// /app/api/history/route.ts
export const revalidate = 300; // 5 minutes

interface Point {
  time: number;
  value: number;
}

interface CGResponse {
  prices: [number, number][];
}

// -----------------------------
// HELPERS
// -----------------------------
const isFiat = (id: string): boolean =>
  id.length >= 3 && id.length <= 5 && /^[A-Z]+$/.test(id);

// -----------------------------
// FETCH CRYPTO (CoinGecko)
// -----------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return [];

  const d = (await r.json()) as CGResponse;
  if (!d.prices) return [];

  return d.prices.map(([ts, v]) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

// -----------------------------
// FETCH FIAT
// -----------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    // flat line of 1.0
    const now = new Date();
    const out: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const t = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - i
      );
      out.push({ time: Math.floor(t / 1000), value: 1 });
    }
    return out.reverse();
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
    `${end.toISOString().slice(0, 10)}?from=USD&to=${symbol}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const d = await r.json();
  const pts: Point[] = Object.keys(d.rates)
    .map((day) => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / d.rates[day][symbol],
    }))
    .sort((a, b) => a.time - b.time);

  return pts;
}

// -----------------------------
// HOURLY BUCKETIZER (for ≤30D)
// -----------------------------
function toHourly(raw: Point[]): Point[] {
  const map = new Map<number, number>();
  for (const p of raw) {
    const bucket = Math.floor(p.time / 3600) * 3600;
    map.set(bucket, p.value);
  }
  return [...map.entries()]
    .map(([t, v]) => ({ time: t, value: v }))
    .sort((a, b) => a.time - b.time);
}

// -----------------------------
// MERGE A/B RATIO (nearest match)
// -----------------------------
function mergeRatio(A: Point[], B: Point[]): Point[] {
  const bt = B.map((p) => p.time);
  const bv = B.map((p) => p.value);

  const out: Point[] = [];
  for (const p of A) {
    // find nearest <= timestamp
    let lo = 0,
      hi = bt.length - 1,
      idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bt[mid] <= p.time) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (idx >= 0 && bv[idx] !== 0 && Number.isFinite(bv[idx])) {
      out.push({ time: p.time, value: p.value / bv[idx] });
    }
  }
  return out;
}

// -----------------------------
// MAIN API HANDLER
// -----------------------------
export async function GET(req: Request) {
  const url = new URL(req.url);

  const base = url.searchParams.get("base") || "";
  const quote = url.searchParams.get("quote") || "";
  let days = Number(url.searchParams.get("days") ?? 30);
  if (!Number.isFinite(days) || days < 1) days = 30;
  days = Math.floor(days);

  if (!base || !quote) return Response.json({ history: [] });

  // Fetch raw series
  const Araw = isFiat(base)
    ? await fetchFiat(base.toUpperCase(), days)
    : await fetchCrypto(base.toLowerCase(), days);

  const Braw = isFiat(quote)
    ? await fetchFiat(quote.toUpperCase(), days)
    : await fetchCrypto(quote.toLowerCase(), days);

  if (!Araw.length || !Braw.length) return Response.json({ history: [] });

  // HOURLY ONLY for ≤30 days
  let A = Araw;
  let B = Braw;

  if (days <= 30) {
    A = toHourly(Araw);
    B = toHourly(Braw);
  }

  // >30 days → leave untouched (daily)
  const merged = mergeRatio(A, B);

  return Response.json({ history: merged });
}
