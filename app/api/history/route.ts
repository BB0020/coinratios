// /app/api/history/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 60;

// -----------------------------
// TYPES
// -----------------------------
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

// Detect fiat (e.g. USD, EUR)
const isFiat = (id: string): boolean => /^[A-Z]{3,5}$/.test(id);

// Floor timestamp to hour
const floorToHour = (ts: number) => ts - (ts % 3600);

// Floor timestamp to midnight UTC
const floorToDay = (ts: number) =>
  ts - (ts % 86400);

// Downsample hourly → 3H grid (strict)
const is3HourAligned = (ts: number) => (ts % 10800) === 0;

// -----------------------------
// FETCH CRYPTO (CoinGecko)
// -----------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const r = await fetch(url);
  if (!r.ok) return [];

  const d = (await r.json()) as CGResponse;
  if (!d.prices) return [];

  let pts = d.prices.map(([ms, price]) => ({
    time: Math.floor(ms / 1000),
    value: price,
  }));

  // Normalize timestamps based on days
  if (days === 1) {
    // Keep raw 5–10 min data (no rounding)
    return pts;
  }

  if (days === 7 || days === 30 || days === 90) {
    pts = pts.map(p => ({
      time: floorToHour(p.time),
      value: p.value
    }));
  }

  if (days === 365) {
    pts = pts.map(p => ({
      time: floorToDay(p.time),
      value: p.value
    }));
  }

  // Deduplicate after rounding
  const seen = new Set<number>();
  const out: Point[] = [];
  for (const p of pts) {
    if (!seen.has(p.time)) {
      seen.add(p.time);
      out.push(p);
    }
  }

  return out;
}

// -----------------------------
// FETCH USD (used for quote)
// -----------------------------
async function fetchUSD(days: number): Promise<Point[]> {
  // USD=1 always, timestamps must match the merge structure
  // Here we simply generate hourly or daily timestamps based on the request.

  const now = Math.floor(Date.now() / 1000);
  const out: Point[] = [];

  if (days === 1) {
    // Simulate 5-min grid for USD
    for (let i = 0; i <= 288; i++) {
      const t = now - i * 300;
      out.push({ time: t, value: 1 });
    }
    return out.reverse();
  }

  if (days === 7 || days === 30 || days === 90) {
    // Hourly timestamps
    for (let i = 0; i <= days * 24; i++) {
      const t = floorToHour(now - i * 3600);
      out.push({ time: t, value: 1 });
    }
    return out.reverse();
  }

  if (days === 365) {
    // Daily timestamps
    for (let i = 0; i <= 365; i++) {
      const t = floorToDay(now - i * 86400);
      out.push({ time: t, value: 1 });
    }
    return out.reverse();
  }

  return [];
}

// -----------------------------
// NEAREST-PAST MATCHER
// -----------------------------
function nearestPastValue(times: number[], values: number[]) {
  return function (t: number): number | null {
    let lo = 0;
    let hi = times.length - 1;
    let best = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return best === -1 ? null : values[best];
  };
}

// -----------------------------
// MAIN ROUTE
// -----------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")!;
    const quote = url.searchParams.get("quote")!;
    const days = Number(url.searchParams.get("days") ?? 30);

    const [rawA, rawB] = await Promise.all([
      isFiat(base) ? fetchUSD(days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchUSD(days) : fetchCrypto(quote, days),
    ]);

    if (!rawA.length || !rawB.length) {
      return Response.json({ history: [] });
    }

    // Prepare B for nearest lookup
    const timesB = rawB.map(p => p.time);
    const valuesB = rawB.map(p => p.value);
    const nearest = nearestPastValue(timesB, valuesB);

    // Merge into ratio series
    let merged: Point[] = [];
    for (const p of rawA) {
      const div = nearest(p.time);
      if (!div) continue;

      merged.push({
        time: p.time,
        value: p.value / div,
      });
    }

    // 3H grid for 90D
    if (days === 90) {
      merged = merged.filter(p => is3HourAligned(p.time));
    }

    return Response.json({ history: merged });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}