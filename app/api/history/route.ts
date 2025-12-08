// /app/api/history/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------------------------------
// Helpers
// ---------------------------------------
function isFiat(x: string) {
  return /^[A-Z]{3,5}$/.test(x);
}

function msToSec(ms: number) {
  return Math.floor(ms / 1000);
}

// ---------------------------------------
// Fetch live price for appending final point
// ---------------------------------------
async function fetchLivePrice(id: string): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;

  const r = await fetch(url, {
    headers: { "x-cg-pro-api-key": process.env.CG_API_KEY || "" },
    cache: "no-store",
  });

  if (!r.ok) return null;

  const j = await r.json();
  const val = j?.[id]?.usd ?? null;
  return typeof val === "number" ? val : null;
}

// ---------------------------------------
// Fetch crypto history by days with resolution rules
// ---------------------------------------
async function fetchCrypto(id: string, days: number) {
  if (days === 1 || days === 7 || days === 30) {
    // RAW minute (1D) or hourly (7D/30D)
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

    const r = await fetch(url, {
      headers: { "x-cg-pro-api-key": process.env.CG_API_KEY || "" },
      cache: "no-store",
    });

    if (!r.ok) return [];

    const j = await r.json();
    return j.prices.map((p: any) => ({
      time: msToSec(p[0]),
      value: p[1],
    }));
  }

  if (days === 90 || days === 365) {
    // DAILY ONLY (CG limitation)
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

    const r = await fetch(url, {
      headers: { "x-cg-pro-api-key": process.env.CG_API_KEY || "" },
      cache: "no-store",
    });

    if (!r.ok) return [];

    const j = await r.json();

    // daily values from price array: take every 24h
    const raw = j.prices.map((p: any) => ({
      time: msToSec(p[0]),
      value: p[1],
    }));

    // Downsample to 1-per-day consistently
    const out = [];
    let lastDay = -1;

    for (const p of raw) {
      const day = Math.floor(p.time / 86400);
      if (day !== lastDay) {
        out.push(p);
        lastDay = day;
      }
    }

    return out;
  }

  // fallback
  return [];
}

// ---------------------------------------
// Main API Handler
// ---------------------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const base = searchParams.get("base");
    const quote = searchParams.get("quote");
    const days = Number(searchParams.get("days") || 30);

    if (!base || !quote) return Response.json({ history: [] });

    // Fetch ID list from /api/coins
    const coinRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/coins`, {
      cache: "force-cache",
    });
    const coinJson = await coinRes.json();
    const list = coinJson.coins || [];

    function resolveId(symbolOrId: string) {
      const s = symbolOrId.toLowerCase();
      const found = list.find((c: any) => c.id === s || c.symbol === s);
      return found ? found.id : s;
    }

    const baseId = resolveId(base);
    const quoteId = resolveId(quote);

    const [rawA, rawB] = await Promise.all([
      isFiat(base) ? [] : fetchCrypto(baseId, days),
      isFiat(quote) ? [] : fetchCrypto(quoteId, days),
    ]);

    if (!rawA.length || !rawB.length) {
      return Response.json({ history: [] });
    }

    // build time map for quote
    const mapB = new Map(rawB.map((p: any) => [p.time, p.value]));

    // nearest timestamp in B (simple backward search)
    function nearestB(t: number) {
      let best = null;
      for (const [ts, val] of mapB.entries()) {
        if (ts <= t) best = val;
      }
      return best;
    }

    const merged = [];
    for (const p of rawA) {
      const div = nearestB(p.time);
      if (div) merged.push({ time: p.time, value: p.value / div });
    }

    // ---------------------------------------------------
    // Append live price at end (A_live / B_live)
    // ---------------------------------------------------
    const [liveA, liveB] = await Promise.all([
      fetchLivePrice(baseId),
      fetchLivePrice(quoteId),
    ]);

    if (liveA && liveB) {
      merged.push({
        time: Math.floor(Date.now() / 1000),
        value: liveA / liveB,
      });
    }

    return Response.json({ history: merged });
  } catch (err) {
    console.error("History API Error:", err);
    return Response.json({ history: [] });
  }
}