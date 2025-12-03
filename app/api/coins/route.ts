import { NextResponse } from "next/server";

// ---------------------------------------------
// GLOBAL CACHE (lives per Vercel region)
// ---------------------------------------------
const cache: {
  data: any | null;
  ts: number;
} = { data: null, ts: 0 };

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------
// FIAT LIST + USD
// ---------------------------------------------
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

const USD = { id: "usd", symbol: "USD", name: "US Dollar", image: "https://flagcdn.com/us.svg", type: "fiat" };

// ---------------------------------------------
// FETCH 1250 CRYPTOS
// ---------------------------------------------
async function fetchCryptoPages() {
  const pages = [1, 2, 3, 4, 5];
  const promises = pages.map((p) =>
    fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${p}`
    ).then((r) => r.json())
  );

  const results = await Promise.all(promises);
  return results.flat();
}

// ---------------------------------------------
// ROUTE HANDLER
// ---------------------------------------------
export async function GET() {
  const now = Date.now();

  // serve from cache
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // fetch new data
  const cryptosRaw = await fetchCryptoPages();

  const cryptos = cryptosRaw.map((c: any) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    image: c.image,
    type: "crypto",
  }));

  // alphabetical fiat
  const sortedFiats = [...fiatList].sort((a, b) => a.symbol.localeCompare(b.symbol));

  // merge in correct order (USD first → cryptos → fiat)
  const finalList = [USD, ...cryptos, ...sortedFiats];

  cache.data = finalList;
  cache.ts = now;

  return NextResponse.json(finalList);
}
