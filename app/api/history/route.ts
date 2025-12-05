import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const days = url.searchParams.get("days") ?? "30";

  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  try {
    // ------------------------------------------------------
    // Fetch USD history for a single asset
    // ------------------------------------------------------
    const histURL =
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?` +
      `vs_currency=usd&days=${days}&interval=daily`;

    const r = await fetch(histURL, { cache: "no-store" }).then((r) => r.json());

    if (!r.prices) {
      return NextResponse.json([]);
    }

    // Convert CG format → { time, value }
    const out = r.prices.map((p: any) => ({
      time: Math.floor(p[0] / 1000), // sec
      value: p[1], // USD price
    }));

    return NextResponse.json(out);
  } catch (err) {
    console.error("History API error:", err);
    return NextResponse.json([]);
  }
}
