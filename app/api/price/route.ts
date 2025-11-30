import { NextResponse } from "next/server";

const CACHE_TIME = 60; // 60 sec

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id")!;
  const type = searchParams.get("type")!;
  const symbol = searchParams.get("symbol")!;

  try {
    // USD baseline always = 1
    if (type === "usd") {
      return NextResponse.json({ value: 1 });
    }

    // Crypto → USD
    if (type === "crypto") {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
        { next: { revalidate: CACHE_TIME } }
      );
      const d = await r.json();
      return NextResponse.json({ value: d[id]!.usd });
    }

    // Fiat → USD
    if (type === "fiat") {
      if (symbol === "USD") return NextResponse.json({ value: 1 });

      const r = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${symbol}`,
        { next: { revalidate: CACHE_TIME } }
      );
      const d = await r.json();

      const usdToFiat = d.rates[symbol]!;

      return NextResponse.json({ value: 1 / usdToFiat });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("PRICE API ERROR:", err);
    return NextResponse.json({ error: "Failed to fetch price" }, { status: 500 });
  }
}
