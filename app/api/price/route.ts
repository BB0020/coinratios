export const dynamic = "force-dynamic";
export const revalidate = 15;

const isFiat = (s: string) => /^[A-Z]{3,5}$/.test(s);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let base = (url.searchParams.get("base") || "").toLowerCase();
    let quote = (url.searchParams.get("quote") || "usd").toLowerCase();

    // USD:USD
    if (base === "usd" && quote === "usd") {
      return Response.json({ price: 1 });
    }

    // Fiat conversion (USD per fiat)
    if (isFiat(base.toUpperCase())) {
      const r = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${base.toUpperCase()}`
      );
      const j = await r.json();
      const rate = j.rates?.[base.toUpperCase()];
      return Response.json({ price: rate ? 1 / rate : null });
    }

    // Crypto price from CoinGecko
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${base}&vs_currencies=${quote}`
    );

    if (!r.ok) return Response.json({ price: null });

    const j = await r.json();
    const price = j?.[base]?.[quote];

    return Response.json({ price: typeof price === "number" ? price : null });
  } catch (err) {
    console.error("Price API error:", err);
    return Response.json({ price: null });
  }
}
