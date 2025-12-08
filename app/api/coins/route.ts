// /app/api/coins/route.ts
export const revalidate = 3600;

// Build symbol → ids[]
function buildSymbolIndex(list: any[]) {
  const out: Record<string, string[]> = {};
  for (const c of list) {
    const sym = c.symbol.toUpperCase();
    if (!out[sym]) out[sym] = [];
    out[sym].push(c.id);
  }
  return out;
}

export async function GET() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets" +
      "?vs_currency=usd&order=market_cap_desc&per_page=250";

    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return Response.json({ coins: [], index: {} });

    const data = await res.json();

    const cryptoList = data.map((c: any) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      type: "crypto",
    }));

    const index = buildSymbolIndex(data);

    return Response.json({
      coins: cryptoList,
      index, // <– not used yet, safe to ignore
    });
  } catch (e) {
    return Response.json({ coins: [], index: {} });
  }
}