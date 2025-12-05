import { NextResponse } from "next/server";

const API_KEY = process.env.COINGECKO_API_KEY!;
const BASE_URL = "https://api.coingecko.com/api/v3";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const days = url.searchParams.get("days");

  if (!id || !days) {
    return NextResponse.json({ error: "Missing id/days" }, { status: 400 });
  }

  try {
    const endpoint = `${BASE_URL}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;

    const res = await fetch(endpoint, {
      headers: { "x-cg-demo-api-key": API_KEY },
      cache: "no-store",
    });

    if (!res.ok) {
      console.log("History API failed:", id, days);
      return NextResponse.json([]);
    }

    const data = await res.json();

    // Convert CG format → {time, value}
    const prices = data.prices || [];

    const cleaned = prices.map((p: [number, number]) => ({
      time: Math.floor(p[0] / 1000), // Convert ms → seconds
      value: p[1], // USD price
    }));

    return NextResponse.json(cleaned);
  } catch (err) {
    console.log("History Error:", err);
    return NextResponse.json([]);
  }
}
