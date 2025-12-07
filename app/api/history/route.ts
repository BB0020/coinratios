// /app/api/history/route.ts
export const revalidate = 300; // 5 min cache

interface Point {
  time: number;
  value: number;
}

interface CGRange {
  prices: [number, number][];
}

interface CGDaily {
  prices: [number, number][];
}

interface FrankfurterResponse {
  rates: Record<string, Record<string, number>>;
}

const isFiat = (id: string) => /^[A-Z]{3,5}$/.test(id);

// --------------------------------------
// FETCH RAW RANGE (minute-ish data)
// --------------------------------------
async function fetchRange(id: string, from: number, to: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = (await r.json()) as CGRange;
  if (!j.prices) return [];

  return j.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// --------------------------------------
// FETCH DAILY (CoinGecko)
// --------------------------------------
async function fetchDaily(id: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = (await r.json()) as CGDaily;
  if (!j.prices) return [];

  return j.prices.map(([ts, price]) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// --------------------------------------
// FETCH FIAT (Frankfurter)
// --------------------------------------
function parseDay(day: string) {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}

async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    // flat baseline
    const now = new Date();
    const arr: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const ts =
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - i
        ) / 1000;
      arr.push({ time: ts, value: 1 });
    }
    return arr.reverse();
  }

  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.app/${s}..${e}?from=USD&to=${symbol}`;
  const r = await fetch(url);
  if (!r.ok) return [];

  const j = (await r.json()) as FrankfurterResponse;

  const raw = Object.keys(j.rates)
    .map((day) => ({
      time: parseDay(day),
      value: 1 / j.rates[day][symbol],
    }))
    .sort((a, b) => a.time - b.time);

  // Smooth missing days (weekends)
  const out: Point[] = [];
  const map = new Map(raw.map((p) => [p.time, p.value]));

  let last = raw.length ? raw[0].value : 1;
  const startTs = parseDay(s);

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;
    if (map.has(t)) last = map.get(t)!;
    out.push({ time: t, value: last });
  }

  return out;
}

// --------------------------------------
// MATCH POINTS BY NEAREST TIMESTAMP
// --------------------------------------
function nearestFactory(times: number[], values: number[]) {
  return function (t: number) {
    let lo = 0;
    let hi = times.length - 1;
    let idx = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx === -1 ? null : values[idx];
  };
}

// --------------------------------------
// MAIN HANDLER
// --------------------------------------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base")!;
  const quote = searchParams.get("quote")!;
  const days = Number(searchParams.get("days") ?? 30);

  const now = Math.floor(Date.now() / 1000);

  let A: Point[] = [];
  let B: Point[] = [];

  try {
    // ------------------------------------------------
    // CASE 1 — 1D, 7D, 30D → use /range (hourly behavior)
    // ------------------------------------------------
    if (days <= 30) {
      const from = now - days * 86400;

      A = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRange(base.toLowerCase(), from, now);

      B = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRange(quote.toLowerCase(), from, now);
    }

    // ------------------------------------------------
    // CASE 2 — > 30D → use daily CG
    // ------------------------------------------------
    if (days > 30) {
      A = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(base.toLowerCase(), days);

      B = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(quote.toLowerCase(), days);
    }

    if (!A.length || !B.length) return Response.json({ history: [] });

    const timesB = B.map((p) => p.time);
    const valuesB = B.map((p) => p.value);
    const near = nearestFactory(timesB, valuesB);

    const merged: Point[] = [];

    for (const p of A) {
      const div = near(p.time);
      if (!div || div === 0) continue;
      merged.push({ time: p.time, value: p.value / div });
    }

    return Response.json({ history: merged });
  } catch (e) {
    console.error("History API error:", e);
    return Response.json({ history: [] });
  }
}