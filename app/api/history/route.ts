import { NextResponse } from "next/server";

const CACHE_TIME = 60 * 60 * 24; // 24 hours
const FIAT_START = "1999-01-01";

/* ============================================================
   SAFE FETCH WITH RETRY (fixes CG 429 failures)
============================================================ */
async function fetchWithRetry(url: string, tries = 4, delay = 400): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.ok) return r;

    // wait longer each retry
    await new Promise((res) => setTimeout(res, delay + i * 300));
  }
  throw new Error("fetchWithRetry failed after retries: " + url);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id")!;
  const type = searchParams.get("type")!; // "crypto" | "fiat" | "usd"
  const symbol = searchParams.get("symbol")!;
  const days = Number(searchParams.get("days")!);

  try {
    /* ============================================================
       USD HISTORY (always flat)
============================================================ */
    if (type === "usd" || symbol === "USD") {
      const now = Date.now();
      const out: any[] = [];

      const points = days === 0 ? 365 : days || 1;

      for (let i = points; i >= 0; i--) {
        out.push({
          time: Math.floor((now - i * 86400000) / 1000),
          value: 1,
        });
      }

      return NextResponse.json(out);
    }

    /* ============================================================
       ALL RANGE: days = 0  → full history
============================================================ */
    if (days === 0) {
      if (type === "crypto") {
        // Full crypto history (CG)
        const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=max`;
        const r = await fetchWithRetry(url);
        const d = await r.json();

        const arr =
          d.prices?.map((p: any) => ({
            time: Math.floor(p[0] / 1000),
            value: p[1],
          })) ?? [];

        return NextResponse.json(arr);
      }

      if (type === "fiat") {
        const now = new Date();
        const end = now.toISOString().slice(0, 10);

        const url = `https://api.frankfurter.app/${FIAT_START}..${end}?from=USD&to=${symbol}`;
        const r = await fetchWithRetry(url);
        const d = await r.json();

        const arr = Object.keys(d.rates).map((date) => ({
          time: Math.floor(new Date(date).getTime() / 1000),
          value: 1 / d.rates[date][symbol],
        }));

        return NextResponse.json(arr.sort((a, b) => a.time - b.time));
      }
    }

    /* ============================================================
       24H RANGE (days = 1)
============================================================ */
    if (days === 1) {
      if (type === "crypto") {
        // High-resolution crypto 24H curve
        const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1`;
        const r = await fetchWithRetry(url);
        const d = await r.json();

        const arr =
          d.prices?.map((p: any) => ({
            time: Math.floor(p[0] / 1000),
            value: p[1],
          })) ?? [];

        return NextResponse.json(arr);
      }

      if (type === "fiat") {
        // Fiat only has 1 datapoint → flat
        const url = `https://api.frankfurter.app/latest?from=USD&to=${symbol}`;
        const r = await fetchWithRetry(url);
        const d = await r.json();

        const usdToFiat = d.rates[symbol];
        const fiatUSD = 1 / usdToFiat;

        const now = Date.now();
        const out = [];

        // create multiple points so chart renders
        for (let i = 24; i >= 0; i--) {
          out.push({
            time: Math.floor((now - i * 3600000) / 1000),
            value: fiatUSD,
          });
        }

        return NextResponse.json(out);
      }
    }

    /* ============================================================
       STANDARD RANGES (7D, 1M, 3M, 6M, 1Y)
============================================================ */

    if (type === "crypto") {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetchWithRetry(url);
      const d = await r.json();

      const arr =
        d.prices?.map((p: any) => ({
          time: Math.floor(p[0] / 1000),
          value: p[1],
        })) ?? [];

      return NextResponse.json(arr);
    }

    if (type === "fiat") {
      const now = new Date();
      const start = new Date(now.getTime() - days * 86400000);

      const startISO = start.toISOString().slice(0, 10);
      const endISO = now.toISOString().slice(0, 10);

      const url = `https://api.frankfurter.app/${startISO}..${endISO}?from=USD&to=${symbol}`;
      const r = await fetchWithRetry(url);
      const d = await r.json();

      const arr = Object.keys(d.rates).map((date) => ({
        time: Math.floor(new Date(date).getTime() / 1000),
        value: 1 / d.rates[date][symbol],
      }));

      return NextResponse.json(arr.sort((a, b) => a.time - b.time));
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
