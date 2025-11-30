import { NextResponse } from "next/server";

const CACHE_TIME = 60 * 60 * 24; // 24 hours
const FIAT_START = "1999-01-01";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id")!;
  const type = searchParams.get("type")!;     // "crypto" | "fiat" | "usd"
  const symbol = searchParams.get("symbol")!; // "BTC", "USD", "EUR", etc.
  const days = Number(searchParams.get("days")!);

  try {
    /* ======================================================================
       USD HISTORY (ALWAYS FLAT)
    ====================================================================== */
    if (symbol === "USD" || type === "usd") {
      const now = Date.now();
      const out = [];
      for (let i = 0; i < (days || 1); i++) {
        out.push({
          time: Math.floor((now - i * 86400000) / 1000),
          value: 1,
        });
      }
      return NextResponse.json(out.reverse());
    }

    /* ======================================================================
       ALL RANGE: days=0  →  FULL COIN HISTORY
    ====================================================================== */
    if (days === 0) {
      if (type === "crypto") {
        // FULL CG history
        const r = await fetch(
          `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=max`,
          { next: { revalidate: CACHE_TIME } }
        );
        const d = await r.json();

        const arr =
          d.prices?.map((p: any) => ({
            time: Math.floor(p[0] / 1000),
            value: p[1],
          })) ?? [];

        return NextResponse.json(arr);
      }

      if (type === "fiat") {
        // FULL FIAT history (1999 → today)
        const now = new Date();
        const endISO = now.toISOString().slice(0, 10);

        const r = await fetch(
          `https://api.frankfurter.app/${FIAT_START}..${endISO}?from=USD&to=${symbol}`,
          { next: { revalidate: CACHE_TIME } }
        );
        const d = await r.json();

        const arr = Object.keys(d.rates).map((date) => ({
          time: Math.floor(new Date(date).getTime() / 1000),
          value: 1 / d.rates[date][symbol]!,
        }));

        return NextResponse.json(arr.sort((a, b) => a.time - b.time));
      }
    }

    /* ======================================================================
       24H RANGE (days=1)
       Crypto always has real 24H data.
       Fiat is once per day → flat.
       Crypto↔Fiat merges using option A (fill fiat across crypto timestamps)
    ====================================================================== */
    if (days === 1) {
      if (type === "crypto") {
        // REAL 24H crypto from CG
        const r = await fetch(
          `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1`,
          { next: { revalidate: CACHE_TIME } }
        );
        const d = await r.json();

        const arr =
          d.prices?.map((p: any) => ({
            time: Math.floor(p[0] / 1000),
            value: p[1],
          })) ?? [];

        return NextResponse.json(arr);
      }

      if (type === "fiat") {
        // Fiat only updates daily → flat 24H
        const now = Date.now();
        const r = await fetch(
          `https://api.frankfurter.app/latest?from=USD&to=${symbol}`,
          { next: { revalidate: CACHE_TIME } }
        );
        const d = await r.json();

        const usdToFiat = d.rates[symbol]!;
        const fiatUSD = 1 / usdToFiat;

        // Return 24 points for consistency
        const out = [];
        for (let i = 24; i >= 0; i--) {
          out.push({
            time: Math.floor((now - i * 3600000) / 1000),
            value: fiatUSD,
          });
        }
        return NextResponse.json(out);
      }
    }

    /* ======================================================================
       STANDARD RANGES (7D → 1Y)
       Crypto → CG
       Fiat → Frankfurter
    ====================================================================== */

    if (type === "crypto") {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
        { next: { revalidate: CACHE_TIME } }
      );

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

      const r = await fetch(
        `https://api.frankfurter.app/${startISO}..${endISO}?from=USD&to=${symbol}`,
        { next: { revalidate: CACHE_TIME } }
      );
      const d = await r.json();

      const arr = Object.keys(d.rates).map((date) => ({
        time: Math.floor(new Date(date).getTime() / 1000),
        value: 1 / d.rates[date][symbol]!,
      }));

      return NextResponse.json(arr.sort((a, b) => a.time - b.time));
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}
