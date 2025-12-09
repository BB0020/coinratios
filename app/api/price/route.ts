import { loadSymbolMap } from "../_coinmap";

export const dynamic = "force-dynamic";
export const revalidate = 15;

const isFiat = (s: string) => /^[A-Z]{3,5}$/.test(s);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let base = (url.searchParams.get("base") || "").toUpperCase();
    let quote = (url.searchParams.get("quote") || "USD").toUpperCase();

    const map = await loadSymbolMap();

    // USD special case
    if (base === "USD" && quote === "USD") {
      return Response.json({ price: 1 });
    }

    // Fiat → USD (Frankfurter)
    if (isFiat(base)) {
      const r = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${base}`
      );
      const j = await r.json();
      const rate = j.rates?.[base];
      if (!rate) return Response.json({ price: null });
      return Response.json({ price: 1 / rate });
    }

    // Map crypto symbol → CG ID
    const cgId = map[base];
    if (!cgId) {
      console.error("Unknown crypto:", base);
      return Response.json({ price: null });
    }

    const urlCG = `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=${quote.toLowerCase()}`;

    const r = await fetch(urlCG);
    if (!r.ok) return Response.json({ price: null });

    const j = await r.json();
    const price = j?.[cgId]?.[quote.toLowerCase()];
    return Response.json({ price: price ?? null });

  } catch (err) {
    console.error("price API error:", err);
    return Response.json({ price: null });
  }
}
