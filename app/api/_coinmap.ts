// app/api/_coinmap.ts
// Loads /api/coins once & builds symbol → CG ID mapping

let cachedMap: Record<string, string> | null = null;
let lastFetch = 0;
const CACHE_MS = 3600_000; // 1 hour

export async function loadSymbolMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedMap && now - lastFetch < CACHE_MS) return cachedMap;

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/coins`);
    const data = await res.json();

    const map: Record<string, string> = {};
    for (const c of data.coins) {
      if (!c.symbol || !c.id) continue;
      map[c.symbol.toUpperCase()] = c.id;
    }

    cachedMap = map;
    lastFetch = now;
    return map;
  } catch (err) {
    console.error("CoinMap load failed:", err);
    return cachedMap ?? {};
  }
}
