import { NextResponse } from "next/server";

const CG_BASE = "https://api.coingecko.com/api/v3";

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

// Fetch hourly crypto history from CG
async function fetchCryptoHistory(id: string, days: number) {
  const url = `${CG_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const res = await fetch(url, { next: { revalidate: 600 } });

  if (!res.ok) return [];

  const data = await res.json();
  if (!data.prices) return [];

  return data.prices.map((p: any) => ({
    time: Math.floor(p[0] / 1000),
    value: p[1], // already USD price
  }));
}

// Fetch daily FX history from Frankfurter (BASE→QUOTE)
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

  // Convert daily rate entries to timeline
  const output = Object.keys(data.rates).map((dateStr) => ({
    time: Math.floor(new Date(dateStr).getTime() / 1000),
    value: data.rates[dateStr][quote],
  }));

  // Frankfurter skips weekends/holidays → fill forward last-known value
  output.sort((a, b) => a.time - b.time);

  let last = output.length > 0 ? output[0].value : null;

  for (let i = 0; i < output.length; i++) {
    if (output[i].value == null) {
      output[i].value = last;
    } else {
      last = output[i].value;
    }
  }

  return output;
}

// Binary search: nearest B.timestamp <= t
function findNearestPast(times: number[], target: number) {
  let lo = 0;
  let hi = times.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= target) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }

  return best;
}

const FIATS = ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"];

// -------------------------------------------------------------
// Main Handler
// -------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const base = url.searchParams.get("base")?.toLowerCase()!;
    const quote = url.searchParams.get("quote")?.toLowerCase()!;
    const days = Number(url.searchParams.get("days") || 7);

    if (!base || !quote) {
      return NextResponse.json({ error: "missing base/quote" }, { status: 400 });
    }

    const isFiat = (c: string) => FIATS.includes(c);

    // ---------------------------------------------------------
    // 1. FETCH BASE HISTORY → normalized to USD/unit
    // ---------------------------------------------------------
    let baseHist: any[] = [];

    if (isFiat(base)) {
      // e.g. base = GBP → fetch GBP→USD (Frankfurter returns USD per GBP? No.)
      // Frankfurter returns: 1 GBP = X USD → done by from=GBP&to=USD
      const raw = await fetchFiatHistory(base.toUpperCase(), "USD", days);
      baseHist = raw.map((pt) => ({
        time: pt.time,
        value: pt.value, // already USD per 1 BASE
      }));
    } else {
      // Crypto is already quoted in USD from CoinGecko
      baseHist = await fetchCryptoHistory(base, days);
    }

    if (baseHist.length === 0)
      return NextResponse.json({ history: [] });

    // ---------------------------------------------------------
    // 2. FETCH QUOTE HISTORY → normalized to USD/unit
    // ---------------------------------------------------------
    let quoteHist: any[] = [];

    if (isFiat(quote)) {
      const raw = await fetchFiatHistory("USD", quote.toUpperCase(), days);
      // Frankfurter returns: 1 USD = X QUOTE
      // We need USD per QUOTE → invert
      quoteHist = raw.map((pt) => ({
        time: pt.time,
        value: 1 / pt.value,
      }));
    } else {
      quoteHist = await fetchCryptoHistory(quote, days);
    }

    if (quoteHist.length === 0)
      return NextResponse.json({ history: [] });

    // ---------------------------------------------------------
    // 3. SORT + ALIGN TIMESTAMPS
    // ---------------------------------------------------------
    const A = baseHist.sort((a, b) => a.time - b.time);
    const B = quoteHist.sort((a, b) => a.time - b.time);

    const timesB = B.map((x) => x.time);
    const valuesB = B.map((x) => x.value);

    const MAX_DIFF = 90 * 60; // 90 min strict
    const MAX_DIFF_FALLBACK = 120 * 60; // fallback: 120 min

    let merged: any[] = [];

    function alignWithLimit(limit: number) {
      const out = [];
      for (const a of A) {
        const idx = findNearestPast(timesB, a.time);
        if (idx === -1) continue;

        const matchTime = timesB[idx];
        if (a.time - matchTime > limit) continue;

        const divisor = valuesB[idx];
        const ratio = a.value / divisor;
        if (!Number.isFinite(ratio)) continue;

        out.push({ time: a.time, value: ratio });
      }
      return out;
    }

    // First pass: strict 90-minute matching
    merged = alignWithLimit(MAX_DIFF);

    // Fallback: relax to 120 minutes
    if (merged.length < 5) {
      merged = alignWithLimit(MAX_DIFF_FALLBACK);
    }

    return NextResponse.json({ history: merged });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
