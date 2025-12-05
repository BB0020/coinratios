import { NextResponse } from "next/server";

const CACHE_TIME = 60 * 60 * 24; // 24 hours

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?" +
        "vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false",
      {
        next: { revalidate: CACHE_TIME }, // server cache
      }
    );

    const data = await res.json();

    const out = data.map((c: any) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      type: "crypto",
    }));

    return NextResponse.json({ cryptos: out });
  } catch (err) {
    console.error("COINS API ERROR:", err);
    return NextResponse.json({ error: "Failed to fetch coins" }, { status: 500 });
  }
}
