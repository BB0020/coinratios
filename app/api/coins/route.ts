// /app/api/coins/route.ts
export const revalidate = 3600; // 1 hour server cache

export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250",
      { next: { revalidate: 3600 } } // extra layer of caching
    );

    if (!res.ok) return Response.json({ coins: [] });

    const data = await res.json();

    const cryptoList = data.map((c: any) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      type: "crypto",
    }));

    return Response.json({ coins: cryptoList });
  } catch (e) {
    return Response.json({ coins: [] });
  }
}