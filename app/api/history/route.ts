export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

const isFiat = (s: string) => /^[A-Z]{3,5}$/.test(s);

// Fetch /api/coins map to resolve e.g. SOL → solana
async function resolveId(sym: string): Promise<string | null> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/coins`);
  const j = await r.json();
  return j.map?.[sym.toUpperCase()] || null;
}

// Fetch crypto raw from CoinGecko
async function fetchCryptoRaw(id: string, days: number): Promise<Point[]> {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
  );
  if (!r.ok) return [];
  const j = await r.json();

  return (j.prices || []).map((p: [number, number]) => ({
    time: Math.floor(p[0] / 1000),
    value: p[1],
  }));
}

// Fetch fiat (daily)
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  if (symbol === "USD") {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: days + 1 }, (_, i) => ({
      time: now - (days - i) * 86400,
      value: 1,
    }));
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))
    .toISOString()
    .slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);

  const r = await fetch(
    `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`
  );
  const j = await r.json();

  const pts = Object.keys(j.rates || []).map((d) => ({
    time: Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 1000),
    value: 1 / j.rates[d][symbol],
  }));

  return pts.sort((a, b) => a.time - b.time);
}

// Bin into regular intervals
function binSeries(raw: Point[], intervalSec: number): Point[] {
  if (raw.length === 0) return [];

  const start = raw[0].time;
  const end = raw[raw.length - 1].time;

  const bins: Point[] = [];
  let binTime = start;
  let lastValue = raw[0].value;
  let i = 0;

  while (binTime <= end) {
    while (i < raw.length && raw[i].time <= binTime) {
      lastValue = raw[i].value;
      i++;
    }
    bins.push({ time: binTime, value: lastValue });
    binTime += intervalSec;
  }

  return bins;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const baseSym = url.searchParams.get("base")?.toUpperCase() || "";
    const quoteSym = url.searchParams.get("quote")?.toUpperCase() || "";
    const days = Number(url.searchParams.get("days") || 30);

    // Resolve IDs
    const baseId = isFiat(baseSym) ? baseSym : await resolveId(baseSym);
    const quoteId = isFiat(quoteSym) ? quoteSym : await resolveId(quoteSym);

    if (!baseId || !quoteId) return Response.json({ history: [] });

    // Fetch series
    const [rawA, rawB] = await Promise.all([
      isFiat(baseSym) ? fetchFiat(baseSym, days) : fetchCryptoRaw(baseId, days),
      isFiat(quoteSym) ? fetchFiat(quoteSym, days) : fetchCryptoRaw(quoteId, days),
    ]);

    if (!rawA.length || !rawB.length) return Response.json({ history: [] });

    // Determine interval
    let interval = 3600; // default 1h

    if (days <= 1) interval = 300; // 5-min
    else if (days <= 7) interval = 3600; // 1-h
    else if (days <= 30) interval = 3600; // 1-h
    else if (days <= 90) interval = 10800; // 3-h
    else interval = 86400; // 1-d

    const a = binSeries(rawA, interval);
    const b = binSeries(rawB, interval);

    const out: Point[] = [];
    let i = 0;
    let j = 0;
    let lastB = b[0].value;

    for (const p of a) {
      while (j < b.length && b[j].time <= p.time) {
        lastB = b[j].value;
        j++;
      }
      if (lastB) out.push({ time: p.time, value: p.value / lastB });
    }

    return Response.json({ history: out });
  } catch (err) {
    console.error("History API error:", err);
    return Response.json({ history: [] });
  }
}
