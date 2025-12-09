// app/api/_coinmap.ts
let cache: Record<string, string> | null = null;
let last = 0;
const TTL = 3600_000;

export async function getSymbolToIdMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - last < TTL) return cache;

  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/coins`);
  const { coins } = await res.json();
  const m: Record<string,string> = {};
  for (const c of coins) {
    m[c.symbol.toUpperCase()] = c.id;
  }
  cache = m;
  last = now;
  return m;
}
