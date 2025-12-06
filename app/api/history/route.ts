// /app/api/history/route.ts
import { NextResponse } from "next/server";

const CG_BASE = "https://api.coingecko.com/api/v3";

// ------------------------------
// FETCH CRYPTO HISTORY
// ------------------------------
async function fetchCryptoHistory(id: string, days: number) {
  const url = `${CG_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url, { next: { revalidate: 600 } });

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.prices) return [];

  return data.prices.map((p: any) => ({
    time: Math.floor(p[0] / 1000),
    value: p[1]
  }));
}

// ------------------------------
// FETCH FIAT HISTORY (corrected)
// ------------------------------
async function fetchFiatHistory(base: string, quote: string, days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?amount=1&from=${base}&to=${quote}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.rates) return [];

  return Object.keys(data.rates).map((dateStr) => ({
    time: Math.floor(new Date(dateStr).getTime() / 1000),
    value: data.rates[dateStr][quote] // DO NOT INVERT HERE
  }));
}

// ------------------------------
// NEAREST TIMESTAMP MATCH (fix for BTC→ETH)
// ------------------------------
function makeNearestIndex(times: number[]) {
  return function (target: number) {
    // binary search
    let lo = 0;
    let hi = times.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }

    // nearest past = hi
    // nearest future = lo
    const pastIdx = hi >= 0 ? hi : null;
    const futureIdx = lo < times.length ? lo : null;

    if (pastIdx === null) return futureIdx;        // only future available  
    if (futureIdx === null) return pastIdx;        // only past available  

    // choose whichever one is closer in time
    const pastDiff = Math.abs(times[pastIdx] - target);
    const futureDiff = Math.abs(times[futureIdx] - target);

    return pastDiff <= futureDiff ? pastIdx : futureIdx;
  };
}

// ------------------------------
// MAIN HANDLER
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

    const isFiat = (c: string) =>
      ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(c);

    // ----------------------------------------
    // FETCH BASE SERIES (correct fiat logic)
    // ----------------------------------------
    let baseHist: any[] = [];

    if (isFiat(base)) {
      // base → quote must be converted to base→USD
      const raw = await fetchFiatHistory(base.toUpperCase(), "USD", days);

      baseHist = raw.map((p) => ({
        time: p.time,
        value: p.value // Frankfurter already returns 1 base = X USD → correct
      }));
    } else {
      baseHist = await fetchCryptoHistory(base, days);
    }

    if (baseHist.length === 0) return NextResponse.json({ history: [] });

    // ----------------------------------------
    // FETCH QUOTE SERIES (correct fiat logic)
    // ----------------------------------------
    let quoteHist: any[] = [];

    if (isFiat(quote)) {
      // USD → quote (Frankfurter returns X quote = 1 USD)
      const raw = await fetchFiatHistory("USD", quote.toUpperCase(), days);

      quoteHist = raw.map((p) => ({
        time: p.time,
        value: 1 / p.value // convert USD→quote into quote→USD
      }));
    } else {
      quoteHist = await fetchCryptoHistory(quote, days);
    }

    if (quoteHist.length === 0) return NextResponse.json({ history: [] });

    // ----------------------------------------
    // ALIGN DATASETS
    // ----------------------------------------
    const A = baseHist.sort((a, b) => a.time - b.time);
    const B = quoteHist.sort((a, b) => a.time - b.time);

    const timesB = B.map((x) => x.time);
    const valuesB = B.map((x) => x.value);

    const nearestIndex = makeNearestIndex(timesB);

    const merged: any[] = [];

    for (const pt of A) {
      const idx = nearestIndex(pt.time);
      if (idx === null) continue;

      const divisor = valuesB[idx];
      if (!Number.isFinite(divisor)) continue;

      const ratio = pt.value / divisor;
      if (!Number.isFinite(ratio)) continue;

      merged.push({ time: pt.time, value: ratio });
    }

    return NextResponse.json({ history: merged });
  } catch (err: any) {
    return NextResponse.json({ history: [] });
  }
}