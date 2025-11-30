import { NextResponse } from "next/server";

const CACHE_TIME = 60; // 60 seconds

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id")!;      // coin ID or fiat symbol ID
  const type = searchParams.get("type")!;  // "crypto" | "fiat" | "usd"
  const symbol = searchParams.get("symbol")!; // "BTC", "USD", "EUR", etc.

  try {
    /* ======================================================================
       USD → USD (baseline)
       Always return 1
    ====================================================================== */
    if (type === "usd" || symbol === "USD") {
      return NextResponse.json({ value: 1 });
    }

    /* ======================================================================
       CRYPTO → USD
       Use CoinGecko simple price
    ====================================================================== */
    if (type === "crypto") {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
        { next: { revalidate: CACHE_TIME } }
      );

      const d = await r.json();
      const value = d[id]!.usd;

      return NextResponse.json({ value });
    }

    /* ======================================================================
       FIAT → USD
       use Frankfurter (1 USD = X EUR, etc.)
       We return fiatUSD = 1 / (USD→fiat rate)
    ====================================================================== */
    if (type === "fiat") {
      const r = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${symbol}`,
        { next: { revalidate: CACHE_TIME } }
      );

      const d = await r.json();

      const usdToFiat = d.rates[symbol]!;
      const fiatUSD = 1 / usdToFiat;

      return NextResponse.json({ value: fiatUSD });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("PRICE API ERROR:", err);
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
