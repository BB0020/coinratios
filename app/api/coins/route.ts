import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FIATS = [
  { id: "usd", symbol: "USD", name: "US Dollar", image: "https://flagsapi.com/US/flat/64.png", type: "fiat" },
  { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagsapi.com/EU/flat/64.png", type: "fiat" },
  { id: "gbp", symbol: "GBP", name: "British Pound", image: "https://flagsapi.com/GB/flat/64.png", type: "fiat" },
  { id: "jpy", symbol: "JPY", name: "Japanese Yen", image: "https://flagsapi.com/JP/flat/64.png", type: "fiat" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "https://flagsapi.com/CA/flat/64.png", type: "fiat" },
  { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "https://flagsapi.com/AU/flat/64.png", type: "fiat" },
  { id: "chf", symbol: "CHF", name: "Swiss Franc", image: "https://flagsapi.com/CH/flat/64.png", type: "fiat" },
  { id: "cny", symbol: "CNY", name: "Chinese Yuan", image: "https://flagsapi.com/CN/flat/64.png", type: "fiat" },
  { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagsapi.com/HK/flat/64.png", type: "fiat" },
  { id: "inr", symbol: "INR", name: "Indian Rupee", image: "https://flagsapi.com/IN/flat/64.png", type: "fiat" },
  { id: "nzd", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagsapi.com/NZ/flat/64.png", type: "fiat" },
  { id: "sek", symbol: "SEK", name: "Swedish Krona", image: "https://flagsapi.com/SE/flat/64.png", type: "fiat" },
  { id: "sgd", symbol: "SGD", name: "Singapore Dollar", image: "https://flagsapi.com/SG/flat/64.png", type: "fiat" },
  { id: "zar", symbol: "ZAR", name: "South African Rand", image: "https://flagsapi.com/ZA/flat/64.png", type: "fiat" }
];

async function fetchPage(page: number) {
  const url = `https://api.coingecko.com/api/v3/coins/markets` +
              `?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`;

  const res = await fetch(url, { cache: "no-store" });
  return await res.json();
}

export async function GET() {
  try {
    // Fetch 5 × 250 = 1250 coins
    const pages = await Promise.all([
      fetchPage(1),
      fetchPage(2),
      fetchPage(3),
      fetchPage(4),
      fetchPage(5),
    ]);

    const cryptos = pages.flat().map((c: any) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      type: "crypto",
    }));

    return NextResponse.json([...FIATS, ...cryptos]);
  } catch (err) {
    console.error("Coins API error:", err);
    return NextResponse.json({ error: "coins_error" }, { status: 500 });
  }
}
