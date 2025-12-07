// /app/api/history/route.ts
// FINAL VERSION — Hourly < 90D, 3H at 90D, Daily > 90D
// Uses CoinGecko's correct unified header: x-cg-api-key

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const CG_HEADERS = {
  accept: "application/json",
  "User-Agent": "coinratios/1.0",
  "x-cg-api-key": process.env.CG_KEY ?? "",   // ✔ Correct header (matches CryptoXHour)
};

const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

/* ----------------------------------------
   Resolve CoinGecko ID
---------------------------------------- */
async function resolveId(sym: string): Promise<string> {
  const r = await fetch(
    "https://api.coingecko.com/api/v3/coins/list?include_platform=false",
    { headers: CG_HEADERS }
  );

  if (!r.ok) return sym;

  const list = await r.json();

  const exact = list.find((c: any) => c.id === sym);
  if (exact) return exact.id;

  const bySymbol = list.find(
    (c: any) => c.symbol.toLowerCase() === sym.toLowerCase()
  );

  return bySymbol?.id ?? sym;
}

/* ----------------------------------------
   Fetch HOURLY (≤ 90D)
---------------------------------------- */
async function fetchHourly(id: string, days: number): Promise<Point[]> {
  const realId = await resolveId(id);

  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;

  const url =
    `https://api.coingecko.com/api/v3/coins/${realId}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${now}`;

  const r = await fetch(url, {
    headers: CG_HEADERS,
    cache: "no-store",
  });

  if (!r.ok) {
    console.error("CG hourly error", r.status, await r.text());
    return [];
  }

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

/* ----------------------------------------
   Downsample HOURLY → 3H (days === 90)
   (CMC-style: use LAST price per bucket)
---------------------------------------- */
function downsample3H(raw: Point[]): Point[] {
  const THREE_HOURS = 3 * 3600;

  const buckets = new Map<number, Point>();

  for (const p of raw) {
    const bucketTs = Math.floor(p.time / THREE_HOURS) * THREE_HOURS;
    buckets.set(bucketTs, p); // overwrite → LAST price wins
  }

  return [...buckets.entries()]
    .map(([time, point]) => ({ time, value: point.value }))
    .sort((a, b) => a.time - b.time);
}

/* ----------------------------------------
   Fetch DAILY (> 90D)
---------------------------------------- */
async function fetchDaily(id: string, days: number): Promise<Point[]> {
  const realId = await resolveId(id);

  const url =
    `https://api.coingecko.com/api/v3/coins/${realId}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, {
    headers: CG_HEADERS,
    cache: "no-store",
  });

  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, v]: any) => ({
    time: Math.floor(ts / 1000),
    value: v,
  }));
}

/* ----------------------------------------
   Fiat fetch (daily only)
---------------------------------------- */
async function fetchFiat(sym: string, days: number): Promise<Point[]> {
  const f = sym.toUpperCase();

  if (f === "USD") {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: days + 1 }).map((_, i) => ({
      time: now - (days - i) * 86400,
      value: 1,
    }));
  }

  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

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

/* ----------------------------------------
   Merge ratio
---------------------------------------- */
function mergeRatio(A: Point[], B: Point[]): Point[] {
  const len = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < len; i++) {
    const ratio = A[i].value / B[i].value;
    if (Number.isFinite(ratio)) {
      out.push({ time: A[i].time, value: ratio });
    }
  }
  return out;
}

/* ----------------------------------------
   MAIN HANDLER
---------------------------------------- */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    const days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });

    let Araw: Point[] = [];
    let Braw: Point[] = [];

    /* ---------------------------
       CASE 1 + CASE 2: ≤ 90D
       --------------------------- */
    if (days <= 90) {
      Araw = isFiat(base) ? await fetchFiat(base, days) : await fetchHourly(base, days);
      Braw = isFiat(quote) ? await fetchFiat(quote, days) : await fetchHourly(quote, days);

      // CASE 2: Exactly 90D → convert to 3H
      if (days === 90) {
        if (!isFiat(base)) Araw = downsample3H(Araw);
        if (!isFiat(quote)) Braw = downsample3H(Braw);
      }
    }

    /* ---------------------------
       CASE 3: > 90D → Daily
       --------------------------- */
    if (days > 90) {
      Araw = isFiat(base) ? await fetchFiat(base, days) : await fetchDaily(base, days);
      Braw = isFiat(quote) ? await fetchFiat(quote, days) : await fetchDaily(quote, days);
    }

    if (!Araw.length || !Braw.length) {
      return Response.json({ history: [] });
    }

    const merged = mergeRatio(Araw, Braw);

    return Response.json({ history: merged });
  } catch (err) {
    console.error("history API error:", err);
    return Response.json({ history: [] });
  }
}