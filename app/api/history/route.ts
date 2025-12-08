// /app/api/history/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 120; // cache per 2 min

interface Point {
  time: number;
  value: number;
}

//
// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
const isFiat = (s: string) =>
  ["USD", "EUR", "GBP", "CAD", "JPY", "CHF", "AUD"].includes(
    s.toUpperCase()
  );

const CG_HEADERS = {
  accept: "application/json",
  "x-cg-api-key": process.env.CG_KEY ?? "",
  "User-Agent": "coinratios-app",
};

function mergeRatio(A: Point[], B: Point[]): Point[] {
  const L = Math.min(A.length, B.length);
  const out: Point[] = [];
  for (let i = 0; i < L; i++) {
    if (!B[i].value) continue;
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v))
      out.push({ time: A[i].time, value: v });
  }
  return out;
}

//
// -----------------------------------------------------
// Fetch crypto (daily) for >90D
// -----------------------------------------------------
async function fetchDaily(symbol: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { headers: CG_HEADERS });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: any) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

//
// -----------------------------------------------------
// Fetch hourly-range crypto (1–90D)
// -----------------------------------------------------
async function fetchRange(symbol: string, from: number, to: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${symbol}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;

  const r = await fetch(url, { headers: CG_HEADERS });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: [number, number]) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

//
// -----------------------------------------------------
// Fetch fiat (daily only)
// -----------------------------------------------------
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  // USD baseline = flat 1
  if (sym === "USD") {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: days + 1 }, (_, i) => ({
      time: now - (days - i) * 86400,
      value: 1,
    }));
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
    `${end.toISOString().slice(0, 10)}?from=USD&to=${sym}`;

  const r = await fetch(url);
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.rates) return [];

  const pts: Point[] = Object.keys(j.rates)
    .map((d) => ({
      time: Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[d][sym],
    }))
    .sort((a, b) => a.time - b.time);

  return pts;
}

//
// -----------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")?.toLowerCase();
    const quote = url.searchParams.get("quote")?.toLowerCase();
    let days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });
    if (!Number.isFinite(days) || days < 1) days = 30;
    days = Math.floor(days);

    const now = Math.floor(Date.now() / 1000);
    const from = now - days * 86400;

    let A: Point[] = [];
    let B: Point[] = [];

    //
    // -----------------------------------------------------
    // Case 1: 1–30 Days → Hourly (range)
    // -----------------------------------------------------
    //
    if (days <= 30) {
      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRange(base, from, now);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRange(quote, from, now);

      A = rawA;
      B = rawB;
    }

    //
    // -----------------------------------------------------
    // Case 2: 31–90 Days → Hourly fetch → display every 3h
    // -----------------------------------------------------
    //
    if (days > 30 && days <= 90) {
      const rawA = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchRange(base, from, now);

      const rawB = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchRange(quote, from, now);

      rawA.sort((a, b) => a.time - b.time);
      rawB.sort((a, b) => a.time - b.time);

      const L = Math.min(rawA.length, rawB.length);
      const hourlyA = rawA.slice(-L);
      const hourlyB = rawB.slice(-L);

      // Take every 3rd point = EXACT 3h spacing
      A = hourlyA.filter((_, i) => i % 3 === 0);
      B = hourlyB.filter((_, i) => i % 3 === 0);
    }

    //
    // -----------------------------------------------------
    // Case 3: >90 Days → Daily
    // -----------------------------------------------------
    //
    if (days > 90) {
      A = isFiat(base)
        ? await fetchFiat(base, days)
        : await fetchDaily(base, days);

      B = isFiat(quote)
        ? await fetchFiat(quote, days)
        : await fetchDaily(quote, days);
    }

    if (!A.length || !B.length)
      return Response.json({ history: [] });

    return Response.json({ history: mergeRatio(A, B) });
  } catch (err) {
    console.error("History API Error:", err);
    return Response.json({ history: [] });
  }
}