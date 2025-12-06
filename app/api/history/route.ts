import { NextResponse } from "next/server";

const CG_BASE = "https://api.coingecko.com/api/v3";

// ------------------------------
// HELPERS
// ------------------------------
async function fetchCryptoHistory(id: string, days: number) {
  const url = `${CG_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url, { next: { revalidate: 600 } });

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.prices) return [];

  // Convert [timestampMs, price] → { time: seconds, value }
  return data.prices.map((p: any) => ({
    time: Math.floor(p[0] / 1000),
    value: p[1],
  }));
}

async function fetchFiatHistory(base: string, quote: string, days: number) {
  // Frankfurter supports yyyy-mm-dd ranges, so we compute them.
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?amount=1&from=${base}&to=${quote}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.rates) return [];

  // Convert daily data → [{time, value}]
  return Object.keys(data.rates).map((dateStr) => {
    return {
      time: Math.floor(new Date(dateStr).getTime() / 1000),
      value: data.rates[dateStr][quote],
    };
  });
}

// Binary search: find nearest timestamp <= t
function makeNearestPast(times: number[], values: number[]) {
  return function (t: number) {
    let lo = 0,
      hi = times.length - 1,
      best = -1;

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

// ------------------------------
// MAIN API HANDLER
// ------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")?.toLowerCase()!;
    const quote = url.searchParams.get("quote")?.toLowerCase()!;
    const days = Number(url.searchParams.get("days") || 7);

    if (!base || !quote) {
      return NextResponse.json({ error: "missing base/quote" }, { status: 400 });
    }

    const isFiat = (c: string) => ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(c);

    // ----------------------------------------
    // FETCH BASE HISTORY
    // ----------------------------------------
    let baseHist: any[] = [];
    if (isFiat(base)) {
      baseHist = await fetchFiatHistory(base.toUpperCase(), "USD", days);
      baseHist = baseHist.map((p) => ({ time: p.time, value: 1 / p.value })); // convert fiat→USD
    } else {
      baseHist = await fetchCryptoHistory(base, days);
    }

    if (baseHist.length === 0) {
      return NextResponse.json({ history: [] });
    }

    // ----------------------------------------
    // FETCH QUOTE HISTORY
    // ----------------------------------------
    let quoteHist: any[] = [];
    if (isFiat(quote)) {
      quoteHist = await fetchFiatHistory("USD", quote.toUpperCase(), days);
    } else {
      quoteHist = await fetchCryptoHistory(quote, days);
    }

    if (quoteHist.length === 0) {
      return NextResponse.json({ history: [] });
    }

    // ----------------------------------------
    // ALIGN DATASETS
    // ----------------------------------------
    const A = baseHist.sort((a, b) => a.time - b.time);
    const B = quoteHist.sort((a, b) => a.time - b.time);

    const timesB = B.map((x) => x.time);
    const valuesB = B.map((x) => x.value);

    const nearestPast = makeNearestPast(timesB, valuesB);

    const merged: any[] = [];
    const MAX_DIFF = 90 * 60; // 90 minutes allowed drift

    for (const pt of A) {
      const divisor = nearestPast(pt.time);
      if (divisor === null) continue;

      const idx = timesB.findIndex((t) => nearestPast(pt.time) === valuesB[timesB.indexOf(t)]);
      const matchTime = idx >= 0 ? timesB[idx] : null;

      if (matchTime !== null && pt.time - matchTime > MAX_DIFF) continue;

      const ratio = pt.value / divisor;
      if (!Number.isFinite(ratio)) continue;

      merged.push({ time: pt.time, value: ratio });
    }

    // If merge succeeded normally, return it.
    if (merged.length > 0) {
      return NextResponse.json({ history: merged });
    }

    // ----------------------------------------
    // FALLBACK ALIGNMENT (up to 2 hours)
    // ----------------------------------------
    const MAX_DIFF_FALLBACK = 120 * 60;

    const fallbackMerged: any[] = [];
    for (const pt of A) {
      const divisor = nearestPast(pt.time);
      if (divisor === null) continue;

      const idx = timesB.findIndex((t) => nearestPast(pt.time) === valuesB[timesB.indexOf(t)]);
      const matchTime = idx >= 0 ? timesB[idx] : null;

      if (matchTime !== null && pt.time - matchTime > MAX_DIFF_FALLBACK) continue;

      const ratio = pt.value / divisor;
      if (!Number.isFinite(ratio)) continue;

      fallbackMerged.push({ time: pt.time, value: ratio });
    }

    return NextResponse.json({ history: fallbackMerged });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "unknown error" }, { status: 500 });
  }
}
