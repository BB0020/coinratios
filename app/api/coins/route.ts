import { NextResponse } from "next/server";

// ====== CONFIG ======
const API_KEY = process.env.COINGECKO_API_KEY!;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
let cache = { data: null as any[] | null, ts: 0 };

// ====== HELPERS ======
function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

type ForcedCoin = {
  id: string;
  symbol: string;
  name: string;
  fallbackImage: string;
};

// ====== ALWAYS-INCLUDE COINS ======
const FORCE_COINS: ForcedCoin[] = [
  {
    id: "metacade",
    symbol: "MCADE",
    name: "Metacade",
    fallbackImage:
      "https://coin-images.coingecko.com/coins/images/29764/small/Square_Profile_Photo_1080_x_1080px.png",
  },
];

// ====== FIAT LIST ======
const fiatList = [
  { id: "usd", symbol: "USD", name: "US Dollar", image: "https://flagcdn.com/us.svg", type: "fiat" },
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

// ====== FETCH PAGE OF MARKET CAP LIST ======
async function fetchPage(page: number) {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`;

  try {
    const res = await fetch(url, {
      headers: { "x-cg-demo-api-key": API_KEY },
      cache: "no-store",
    });

    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ====== FETCH FORCED COIN (MCADE) ======
async function fetchForced(coin: ForcedCoin) {
  const url = `https://api.coingecko.com/api/v3/coins/${coin.id}`;

  try {
    const res = await fetch(url, {
      headers: { "x-cg-demo-api-key": API_KEY },
      cache: "no-store",
    });

    if (!res.ok) {
      console.log("FALLBACK used for:", coin.id);
      return {
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        image: coin.fallbackImage,
        type: "crypto",
      };
    }

    const data = await res.json();
    const image =
      data?.image?.small ??
      data?.image?.thumb ??
      data?.image?.large ??
      coin.fallbackImage;

    return {
      id: data.id,
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      image,
      type: "crypto",
    };
  } catch (err) {
    console.log("ERROR fetching forced coin:", coin.id, err);
    return {
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      image: coin.fallbackImage,
      type: "crypto",
    };
  }
}

// ====== API HANDLER ======
export async function GET() {
  const now = Date.now();

  // Serve cached version
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  // Fetch 5 pages → 1250 coins
  const pages = [];
  for (let p = 1; p <= 5; p++) {
    pages.push(await fetchPage(p));
    await delay(120);
  }

  const flat = pages.flat();

  const cryptos = flat.map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    image: c.image,
    type: "crypto",
  }));

  // Add forced coins like MCADE
  const forcedResults = [];
  for (const coin of FORCE_COINS) {
    if (!cryptos.some((x) => x.id === coin.id)) {
      const extra = await fetchForced(coin);
      forcedResults.push(extra);
    }
  }

  // Final list: Fiat → Cryptos → Forced coins
  const finalList = [...fiatList, ...cryptos, ...forcedResults];

  cache = { data: finalList, ts: now };

  return NextResponse.json(finalList);
}
