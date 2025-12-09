export const dynamic = "force-dynamic";
export const revalidate = 15;

// REAL fiat whitelist (CoinGecko-supported)
const FIAT = new Set([
  "USD","EUR","GBP","JPY","CAD","AUD","CHF","CNY","SEK","NZD",
  "INR","BRL","RUB","HKD","SGD","MXN","ZAR"
]);

const isFiat = (s: string) => FIAT.has(s.toUpperCase());

const CG = "https://api.coingecko.com/api/v3/simple/price";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let base = url.searchParams.get("base") || "";
    let quote = url.searchParams.get("quote") || "usd";

    base = base.toLowerCase();
    quote = quote.toLowerCase();

    // 0) USD direct
    if (base === "usd" && quote === "usd") {
      return Response.json({ price: 1 });
    }

    // 1) FIAT branch (ONLY real fiats)
    if (isFiat(base)) {
      const r = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${base.toUpperCase()}`
      );
      const j = await r.json();
      const rate = j.rates?.[base.toUpperCase()];
      if (!rate) return Response.json({ price: null });
      return Response.json({ price: 1 / rate });
    }

    // 2) Crypto branch
    const cgUrl = `${CG}?ids=${base}&vs_currencies=${quote}`;
    const r = await fetch(cgUrl);

    if (!r.ok) {
      console.error("CG error:", r.status);
      return Response.json({ price: null });
    }

    const j = await r.json();
    const price = j?.[base]?.[quote];

    if (typeof price !== "number") {
      console.error("CG no price for:", base, j);
      return Response.json({ price: null });
    }

    return Response.json({ price });
  } catch (err) {
    console.error("Price API error:", err);
    return Response.json({ price: null });
  }
}
