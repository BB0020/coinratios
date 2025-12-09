export const revalidate = 3600; // cache 1 hour

// Strong type for CoinGecko markets response
interface CGMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets" +
        "?vs_currency=usd&order=market_cap_desc&per_page=250",
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return Response.json({ coins: [], map: {} });

    const data = (await res.json()) as CGMarket[];

    const coins = data.map((c: CGMarket) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      type: "crypto" as const,
    }));

    // Build reverse lookup map: SYMBOL → ID
    const map: Record<string, string> = {};
    for (const coin of coins) {
      map[coin.symbol] = coin.id;
    }

    return Response.json({ coins, map });
  } catch (err) {
    console.error("Coins API error:", err);
    return Response.json({ coins: [], map: {} });
  }
}
