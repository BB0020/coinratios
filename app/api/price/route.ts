// /app/api/price/route.ts
import { getSymbolToIdMap } from "../_coinmap";

export const dynamic = "force-dynamic";
export const revalidate = 15;

const FIAT = new Set([
  "USD","EUR","GBP","JPY","CAD","AUD","CHF","CNY","SEK","NZD",
  "INR","BRL","RUB","HKD","SGD","MXN","ZAR"
]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let base = (url.searchParams.get("base") || "").toUpperCase();
    let quote = (url.searchParams.get("quote") || "USD").toUpperCase();

    const map = await getSymbolToIdMap();

    // USD → USD
    if (base === "USD" && quote === "USD") {
      return Response.json({ price: 1 });
    }

    // Fiat case
    if (FIAT.has(base)) {
      const r = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${base}`
      );
      const j = await r.json();
      const rate = j.rates?.[base];
      if (!rate) return Response.json({ price: null });
      return Response.json({ price: 1 / rate });
    }

    // Crypto case
    const cgId = map[base];
    if (!cgId) {
      console.error("Unknown base symbol:", base);
      return Response.json({ price: null });
    }

    const urlCG =
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=${quote.toLowerCase()}`;
    const r2 = await fetch(urlCG);
    if (!r2.ok) {
      console.error("CG price fetch failed:", r2.status);
      return Response.json({ price: null });
    }

    const j2 = await r2.json();
    const price = j2[cgId]?.[quote.toLowerCase()];
    return Response.json({ price: typeof price === "number" ? price : null });

  } catch (e) {
    console.error("price route error:", e);
    return Response.json({ price: null });
  }
}
