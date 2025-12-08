// /app/api/history/route.ts
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

// -------------------------
// Load coins (id → cgId)
// -------------------------
async function loadCoinMap() {
  const res = await fetch("https://coinratios.com/api/coins");
  const j = await res.json();
  const map: Record<string, string> = {};

  for (const c of j.coins) {
    map[c.symbol.toLowerCase()] = c.id; // Example: btc → bitcoin
    map[c.id.toLowerCase()] = c.id;     // Example: bitcoin → bitcoin
  }

  return map;
}

function bucket3h(raw: Point[]): Point[] {
  const out = new Map<number, number>();

  for (const p of raw) {
    const bucket = Math.floor(p.time / 10800) * 10800; // 3h bucket
    out.set(bucket, p.value); // last value wins
  }

  return [...out.entries()]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
}

async function fetchMarketChart(cgId: string, days: number): Promise<Point[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart` +
    `?vs_currency=usd&days=${days}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, val]: any) => ({
    time: Math.floor(ts / 1000),
    value: val,
  }));
}

async function fetchCurrent(cgId: string): Promise<Point | null> {
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${cgId}&vs_currencies=usd`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;

  const j = await r.json();
  if (!j[cgId]?.usd) return null;

  return {
    time: Math.floor(Date.now() / 1000),
    value: j[cgId].usd,
  };
}

// -----------------------------------------
// MAIN HANDLER
// -----------------------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const base = searchParams.get("base")!.toLowerCase();
    const quote = searchParams.get("quote")!.toLowerCase();
    const days = Number(searchParams.get("days") ?? 30);

    const coinMap = await loadCoinMap();
    const baseId = coinMap[base];
    const quoteId = coinMap[quote];

    if (!baseId || !quoteId) return Response.json({ history: [] });

    // fetch price curves
    let A = await fetchMarketChart(baseId, days);
    let B = await fetchMarketChart(quoteId, days);

    // inject current prices
    const nowA = await fetchCurrent(baseId);
    const nowB = await fetchCurrent(quoteId);

    if (nowA && (!A.length || nowA.time > A[A.length - 1].time)) A.push(nowA);
    if (nowB && (!B.length || nowB.time > B[B.length - 1].time)) B.push(nowB);

    // special 90D: bucket to 3h
    if (days === 90) {
      A = bucket3h(A);
      B = bucket3h(B);
    }

    // merge ratio A/B
    const L = Math.min(A.length, B.length);
    const history: Point[] = [];

    for (let i = 0; i < L; i++) {
      const v = A[i].value / B[i].value;
      if (Number.isFinite(v)) {
        history.push({ time: A[i].time, value: v });
      }
    }

    return Response.json({ history });
  } catch (err) {
    console.error("History API Error:", err);
    return Response.json({ history: [] });
  }
}