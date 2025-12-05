import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FIATS = [
  "usd","eur","gbp","jpy","cad","aud","chf","cny",
  "hkd","inr","nzd","sek","sgd","zar"
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");

  if (!ids) {
    return NextResponse.json({ error: "missing_ids" }, { status: 400 });
  }

  const list = ids.split(",").map((x) => x.toLowerCase());
  const cryptos = list.filter((c) => !FIATS.includes(c));
  const fiats = list.filter((f) => FIATS.includes(f));

  const result: Record<string, number> = {};

  // --------------------------------------------------
  // FETCH CRYPTO → USD
  // --------------------------------------------------
  if (cryptos.length > 0) {
    const cgURL = 
      "https://api.coingecko.com/api/v3/simple/price?ids=" +
      cryptos.join(",") +
      "&vs_currencies=usd";

    const r = await fetch(cgURL, { cache: "no-store" }).then((r) => r.json());

    for (const id of cryptos) {
      result[id] = r[id]?.usd ?? 0;
    }
  }

  // --------------------------------------------------
  // FETCH FIAT → USD
  // --------------------------------------------------
  if (fiats.length > 0) {
    const upper = fiats.map((x) => x.toUpperCase()).join(",");

    const fx = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=" + upper
    ).then((r) => r.json());

    for (const id of fiats) {
      if (id === "usd") {
        result[id] = 1;
      } else {
        const rate = fx.rates?.[id.toUpperCase()];
        result[id] = rate ? 1 / rate : 0;
      }
    }
  }

  return NextResponse.json(result);
}
