// /app/api/history/route.ts
// Final stable version (index-aligned merge)
// ----------------------------------------------------

export const revalidate = 300; // 5 min cache

interface Point {
  time: number;
  value: number;
}

const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

// ----------------------------------------------
// 1. Fetch crypto prices from CoinGecko
// ----------------------------------------------
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, price]: any) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

// ----------------------------------------------
// 2. Fetch fiat prices (Frankfurter)
// ----------------------------------------------
function buildDateRange(days: number) {
  const now = new Date();

  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days
  ));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const parseDay = (day: string) =>
  Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);

function smoothFiat(points: Point[], days: number): Point[] {
  if (!points.length) return [];

  const now = new Date();
  const startTs =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days) /
    1000;

  const map = new Map(points.map(p => [p.time, p.value]));
  const out: Point[] = [];
  let last = points[0].value;

  for (let i = 0; i <= days; i++) {
    const t = startTs + i * 86400;

    if (map.has(t)) {
      last = map.get(t)!;
      out.push({ time: t, value: last });
    } else {
      out.push({ time: t, value: last }); // repeat last valid day
    }
  }

  return out;
}

async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  if (sym === "USD") {
    // 1 USD = 1 baseline
    const now = new Date();
    const arr: Point[] = [];
    for (let i = 0; i <= days; i++) {
      const t =
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - i
        ) / 1000;
      arr.push({ time: t, value: 1 });
    }
    return arr.reverse();
  }

  const { start, end } = buildDateRange(days);
  const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${sym}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.rates) return [];

  const raw = Object.keys(j.rates)
    .map(day => ({
      time: parseDay(day),
      value: 1 / j.rates[day][sym], // convert USD→X to X→USD
    }))
    .sort((a, b) => a.time - b.time);

  return smoothFiat(raw, days);
}

// ----------------------------------------------
// 3. INDEX-BASED MERGE (STRONGEST, MOST RELIABLE)
// ----------------------------------------------
function mergeIndexAligned(A: Point[], B: Point[]) {
  const len = Math.min(A.length, B.length);
  const out: Point[] = [];

  for (let i = 0; i < len; i++) {
    const ratio = A[i].value / B[i].value;
    if (!Number.isFinite(ratio)) continue;

    out.push({
      time: A[i].time, // base timeline
      value: ratio,
    });
  }

  return out;
}

// ----------------------------------------------
// 4. MAIN HANDLER
// ----------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")!.toLowerCase();
    const quote = url.searchParams.get("quote")!.toLowerCase();
    const days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote)
      return Response.json({ history: [] });

    // Fetch both series in parallel
    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length)
      return Response.json({ history: [] });

    // Index merge — **completely fixes empty history**
    const merged = mergeIndexAligned(Araw, Braw);

    return Response.json({ history: merged });

  } catch (err) {
    console.error("API /history error:", err);
    return Response.json({ history: [] });
  }
}