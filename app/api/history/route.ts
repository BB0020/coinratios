import { NextResponse } from "next/server";

const CACHE_TIME = 60 * 60 * 24; // 24 hours

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = searchParams.get("id")!;
  const type = searchParams.get("type")!;
  const symbol = searchParams.get("symbol")!;
  const days = Number(searchParams.get("days")!);

  try {
    /* -------------------------------
       USD BASELINE
    --------------------------------*/
    if (symbol === "USD" || type === "usd") {
      const now = Date.now();
      const out = [];
      for (let i = 0; i < days; i++) {
        out.push({
          time: Math.floor((now - i * 86400000) / 1000),
          value: 1,
        });
      }
      return NextResponse.json(out.reverse());
    }

    /* -------------------------------
       CRYPTO HISTORY (CoinGecko)
    --------------------------------*/
    if (type === "crypto") {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
        { next: { revalidate: CACHE_TIME } }
      );
      const d = await r.json();

      const arr =
        d.prices?.map((p: any) => ({
          time: Math.floor(p[0] / 1000),
          value: p[1],
        })) ?? [];

      return NextResponse.json(arr);
    }

    /* -------------------------------
       FIAT HISTORY (Frankfurter)
    --------------------------------*/
    if (type === "fiat") {
      const now = new Date();
      const start = new Date(now.getTime() - days * 86400000);

      const startISO = start.toISOString().slice(0, 10);
      const endISO = now.toISOString().slice(0, 10);

      const r = await fetch(
        `https://api.frankfurter.app/${startISO}..${endISO}?from=USD&to=${symbol}`,
        { next: { revalidate: CACHE_TIME } }
      );
      const d = await r.json();

      const arr = Object.keys(d.rates).map((date) => ({
        time: Math.floor(new Date(date).getTime() / 1000),
        value: 1 / d.rates[date]![symbol]!,
      }));

      return NextResponse.json(arr.sort((a, b) => a.time - b.time));
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("HISTORY API ERROR:", err);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
