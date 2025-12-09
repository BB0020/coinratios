// /app/api/coins/route.ts
export const revalidate = 3600; // 1 hour cache

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250"
    );
    if (!res.ok) {
      console.error("coins API failed:", res.status);
      return Response.json({ coins: [] });
    }

    const data = await res.json();
    const cryptoList = (data as any[]).filter(c =>
      typeof c.id === "string" && typeof c.symbol === "string"
    ).map(c => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      type: "crypto",
    }));

    return Response.json({ coins: cryptoList });

  } catch (e) {
    console.error("coins API error:", e);
    return Response.json({ coins: [] });
  }
}
