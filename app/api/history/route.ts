import { NextResponse } from "next/server";

const cache: Record<
  string,
  { data: any; ts: number }
> = {};

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function buildKey(id: string, days: string) {
  return `${id}-${days}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const days = url.searchParams.get("days");

  if (!id || !days) {
    return NextResponse.json({ error: "Missing id or days" }, { status: 400 });
  }

  const key = buildKey(id, days);

  if (cache[key] && Date.now() - cache[key].ts < CACHE_TTL) {
    return NextResponse.json(cache[key].data);
  }

  let out: { time: number; value: number }[] = [];

  const isFiat = !id.includes("-") && id.length <= 3 && id !== "bitcoin";

  // ---- Fiat history ------------------------------------
  if (isFiat) {
    if (id.toUpperCase() === "USD") {
      const now = Date.now();
      const arr = [];
      for (let i = Number(days); i >= 0; i--) {
        const t = now - i * 86400000;
        arr.push({ time: Math.floor(t / 1000), value: 1 });
      }
      out = arr;
    } else {
      const now = new Date();
      const start = new Date(now.getTime() - Number(days) * 86400000);
      const startISO = start.toISOString().slice(0, 10);
      const endISO = now.toISOString().slice(0, 10);

      const fx = await fetch(
        `https://api.frankfurter.app/${startISO}..${endISO}?from=USD&to=${id.toUpperCase()}`
      ).then((r) => r.json());

      out = Object.keys(fx.rates).map((d) => {
        const usdToFiat = fx.rates[d][id.toUpperCase()];
        return {
          time: Math.floor(new Date(d).getTime() / 1000),
          value: 1 / usdToFiat,
        };
      });
    }
  }

  // ---- Crypto history -----------------------------------
  if (!isFiat) {
    const cg = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
    ).then((r) => r.json());

    out =
      cg.prices?.map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      })) ?? [];
  }

  out.sort((a, b) => a.time - b.time);

  cache[key] = { data: out, ts: Date.now() };

  return NextResponse.json(out);
}
