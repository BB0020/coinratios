import { NextResponse } from "next/server";

const CACHE_TIME = 60;

/* ============================================================
   SAFE FETCH WITH RETRY (protects against temporary failures)
============================================================ */
async function fetchWithRetry(url: string, tries = 4, delay = 300): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.ok) return r;

    await new Promise((res) => setTimeout(res, delay + i * 200));
  }
  throw new Error("PRICE fetch failed after retries: " + url);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id")!;
  const type = searchParams.get("type")!; // "crypto" | "fiat" | "usd"
  const symbol = searchParams.get("symbol")!;
  
  try {
    /* ============================================================
       USD → USD
============================================================ */
    if (type === "usd" || symbol === "USD") {
      return NextResponse.json({ value: 1 });
    }

    /* ============================================================
       CRYPTO → USD (CoinGecko Simple Price)
============================================================ */
    if (type === "crypto") {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
      const r = await fetchWithRetry(url);
      const d = await r.json();

      const value = d[id]?.usd ?? null;

      return NextResponse.json({ value });
    }

    /* ============================================================
       FIAT → USD (Frankfurter)
============================================================ */
    if (type === "fiat") {
      const url = `https://api.frankfurter.app/latest?from=USD&to=${symbol}`;
      const r = await fetchWithRetry(url);
      const d = await r.json();

      const usdToFiat = d.rates[symbol];
      const fiatUSD = 1 / usdToFiat;

      return NextResponse.json({ value: fiatUSD });
    }

    return NextResponse.json(
      { error: "Invalid type" },
      { status: 400 }
    );

  } catch (err) {
    console.error("PRICE API ERROR:", err);
    return NextResponse.json(
      { error: "Failed to fetch price" },
      { status: 500 }
    );
  }
}
