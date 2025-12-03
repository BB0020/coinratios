import { NextResponse } from "next/server";

const cache: Record<
  string,
  { data: any; ts: number }
> = {};

const CACHE_TTL = 10 * 1000; // 10 seconds

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  if (!ids) return NextResponse.json({ error: "Missing ids" }, { status: 400 });

  const key = ids;

  if (cache[key] && Date.now() - cache[key].ts < CACHE_TTL) {
    return NextResponse.json(cache[key].data);
  }

  const list = ids.split(",");

  // separate crypto and fiat
  const cryptos = list.filter((x) => !["USD", "AUD", "EUR", "JPY", "GBP", "CAD", "CHF", "INR", "CNY", "BRL", "MXN", "NOK", "SEK", "SGD", "TRY", "HKD", "KRW", "ZAR", "NZD", "DKK"].includes(x.toUpperCase()));
  const fiats = list.filter((x) => !cryptos.includes(x));

  let result: Record<string, number> = {};

  // crypto prices
  if (cryptos.length) {
    const cg = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cryptos.join(",")}&vs_currencies=usd`
    ).then((r) => r.json());

    for (const c of cryptos) {
      result[c] = cg[c]?.usd ?? 0;
    }
  }

  // fiat prices (USD → fiat)
  if (fiats.length) {
    const symbols = fiats.map((f) => f.toUpperCase()).join(",");
    const fx = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${symbols}`
    ).then((r) => r.json());

    for (const f of fiats) {
      const rate = fx.rates?.[f.toUpperCase()];
      result[f] = f === "USD" ? 1 : rate ? 1 / rate : 0;
    }
  }

  cache[key] = { data: result, ts: Date.now() };

  return NextResponse.json(result);
}
