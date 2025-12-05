import { NextResponse } from "next/server";

const API_KEY = process.env.COINGECKO_API_KEY!;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache
let cache: { data: any[] | null; ts: number } = {
  data: null,
  ts: 0,
};

// Small wait helper
function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// Fetch a single page of CoinGecko markets
async function fetchPage(page: number, retries = 3) {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd&order=market_cap_desc&per_page=250&page=" +
    page;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "x-cg-demo-api-key": API_KEY },
        cache: "no-store"
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }

    } catch (err) {
      // ignore & retry
    }

    await delay(400 + attempt * 300);
  }

  return [];
}

// FULL FIAT LIST (Correct + FlagCDN SVGs)
const fiatList = [
  { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
  { id: "brl", symbol: "BRL", name: "Brazilian Real", image: "https://flagcdn.com/br.svg", type: "fiat" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
  { id: "chf", symbol: "CHF", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
  { id: "cny", symbol: "CNY", name: "Chinese Yuan", image: "https://flagcdn.com/cn.svg", type: "fiat" },
  { id: "dkk", symbol: "DKK", name: "Danish Krone", image: "https://flagcdn.com/dk.svg", type: "fiat" },
  { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
  { id: "gbp", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
  { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
  { id: "inr", symbol: "INR", name: "Indian Rupee", image: "https://flagcdn.com/in.svg", type: "fiat" },
  { id: "jpy", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
  { id: "krw", symbol: "KRW", name: "South Korean Won", image: "https://flagcdn.com/kr.svg", type: "fiat" },
  { id: "mxn", symbol: "MXN", name: "Mexican Peso", image: "https://flagcdn.com/mx.svg", type: "fiat" },
  { id: "nok", symbol: "NOK", name: "Norwegian Krone", image: "https://flagcdn.com/no.svg", type: "fiat" },
  { id: "nzd", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
  { id: "sek", symbol: "SEK", name: "Swedish Krona", image: "https://flagcdn.com/se.svg", type: "fiat" },
  { id: "sgd", symbol: "SGD", name: "Singapore Dollar", image: "https://flagcdn.com/sg.svg", type: "fiat" },
  { id: "try", symbol: "TRY", name: "Turkish Lira", image: "https://flagcdn.com/tr.svg", type: "fiat" },
  { id: "zar", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
];

// USD is always first
const USD = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

export async function GET() {
  const now = Date.now();

  // Serve from cache
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const all: any[] = [];

  // Pull crypto pages 1 → 5
  for (let page = 1; page <= 5; page++) {
    const pageData = await fetchPage(page);

    if (pageData.length === 0) break; // no more pages or throttled

    all.push(...pageData);

    await delay(200); // spacing to avoid rate-limits
  }

  // Transform into normalized crypto objects
  const cryptos = all.map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    image: c.image,
    type: "crypto",
  }));

  // Final ordering: USD → other fiats → cryptos
  const result = [USD, ...fiatList, ...cryptos];

  // Cache result
  cache = { data: result, ts: now };

  return NextResponse.json(result);
}
