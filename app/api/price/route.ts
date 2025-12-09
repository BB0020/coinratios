export const dynamic = "force-dynamic";
export const revalidate = 15; // small cache for live price

// Detect fiat symbols
const isFiat = (s: string) => /^[A-Z]{3,5}$/.test(s);

// CoinGecko base URL
const CG = "https://api.coingecko.com/api/v3/simple/price";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let base = url.searchParams.get("base") || "";
    let quote = url.searchParams.get("quote") || "usd";

    base = base.toLowerCase();
    quote = quote.toLowerCase();

    // 1) USD direct
    if (base === "usd" && quote === "usd") {
      return Response.json({ price: 1 });
    }

    // 2) FIAT → USD only supports reverse via Frankfurter
    if (isFiat(base.toUpperCase())) {
      const r = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${base.toUpperCase()}`
      );
      const j = await r.json();
      const rate = j.rates?.[base.toUpperCase()];
      if (!rate) return Response.json({ price: null });
      return Response.json({ price: 1 / rate }); // USD per fiat
    }

    // 3) Crypto price from CoinGecko
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
