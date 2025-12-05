import { NextResponse } from "next/server";

const API_KEY = process.env.COINGECKO_API_KEY!;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

let cache: Record<string, { data: any; ts: number }> = {};

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchHistory(id: string, days: number, retries = 4) {
  const url =
    "https://api.coingecko.com/api/v3/coins/" +
    id +
    "/market_chart?vs_currency=usd&days=" +
    days;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "x-cg-demo-api-key": API_KEY },
        cache: "no-store",
      });
      const data = await res.json();

      if (Array.isArray(data.prices) && data.prices.length > 0) {
        return data.prices.map((p: number[]) => ({
          time: Math.floor(p[0] / 1000), // seconds
          value: p[1],
        }));
      }
    } catch {}

    await delay(300 + i * 300);
  }

  return [];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const days = Number(url.searchParams.get("days") || 1);

  if (!id) return NextResponse.json([]);

  const key = `${id}-${days}`;
  const now = Date.now();

  if (cache[key] && now - cache[key].ts < CACHE_TTL) {
    return NextResponse.json(cache[key].data);
  }

  const data = await fetchHistory(id, days);

  // If CoinGecko returned nothing, fall back to cached data
  if (data.length === 0 && cache[key]) {
    return NextResponse.json(cache[key].data);
  }

  cache[key] = { data, ts: now };

  return NextResponse.json(data);
}
