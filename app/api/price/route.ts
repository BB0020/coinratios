// /app/api/price/route.ts
export const revalidate = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids"); // comma-separated crypto IDs
  const fiats = searchParams.get("fiats"); // comma-separated fiat symbols

  const out: any = {};

  try {
    // -----------------------------
    // 1. Crypto batch pricing
    // -----------------------------
    if (ids) {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
      const r = await fetch(url, { next: { revalidate: 60 } });
      const d = await r.json();
      out.crypto = d;
    }

    // -----------------------------
    // 2. Fiat batch pricing
    // -----------------------------
    if (fiats) {
      const fiatList = fiats.split(",");
      const r = await fetch("https://api.frankfurter.app/latest?from=USD");
      const d = await r.json();

      out.fiat = {};

      fiatList.forEach((sym) => {
        if (sym === "USD") {
          out.fiat["USD"] = 1;
        } else {
          const rate = d.rates?.[sym] ?? 0;
          out.fiat[sym] = 1 / rate;
        }
      });
    }

    return Response.json(out);
  } catch (e) {
    return Response.json({ crypto: {}, fiat: {} });
  }
}
