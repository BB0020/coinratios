// /app/api/history/route.ts
export const revalidate = 300; // 5 min cache

interface Point {
  time: number;
  value: number | null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base");
  const quote = searchParams.get("quote");
  const days = Number(searchParams.get("days") ?? 30);

  if (!base || !quote) {
    return Response.json({ history: [] });
  }

  try {
    // ---------------------------------------------------------
    // FETCH CRYPTO (Coingecko)
    // ---------------------------------------------------------
    const fetchCrypto = async (id: string): Promise<Point[]> => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url, { next: { revalidate: 300 } });
      const d = await r.json();

      return (d.prices ?? []).map((p: [number, number]): Point => ({
        time: Math.floor(p[0] / 1000),
        value: Number(p[1]),
      }));
    };

    // ---------------------------------------------------------
    // FETCH FIAT (Frankfurter)
    // ---------------------------------------------------------
    const fetchFiat = async (symbol: string): Promise<Point[]> => {
      if (symbol === "USD") {
        const out: Point[] = [];
        const now = Date.now();

        for (let i = 0; i < days; i++) {
          out.push({
            time: Math.floor((now - i * 86400000) / 1000),
            value: 1,
          });
        }

        return out.reverse();
      }

      const start = new Date(Date.now() - days * 86400000)
        .toISOString()
        .slice(0, 10);
      const end = new Date().toISOString().slice(0, 10);

      const url = `https://api.frankfurter.app/${start}..${end}?from=USD&to=${symbol}`;
      const r = await fetch(url, { next: { revalidate: 300 } });
      const d = await r.json();

      const arr: Point[] = Object.keys(d.rates).map((dayStr: string): Point => {
        const usdToFiat = d.rates[dayStr]?.[symbol];
        return {
          time: Math.floor(new Date(dayStr).getTime() / 1000),
          value: usdToFiat ? 1 / usdToFiat : null,
        };
      });

      return arr
        .filter((pt: Point) => Number.isFinite(pt.value))
        .sort((a: Point, b: Point) => a.time - b.time);
    };

    // ---------------------------------------------------------
    // LOAD BOTH HISTORIES
    // ---------------------------------------------------------
    let [baseHist, quoteHist] = await Promise.all([
      /\d/.test(base) ? fetchCrypto(base) : fetchFiat(base),
      /\d/.test(quote) ? fetchCrypto(quote) : fetchFiat(quote),
    ]);

    baseHist = baseHist.sort((a: Point, b: Point) => a.time - b.time);
    quoteHist = quoteHist.sort((a: Point, b: Point) => a.time - b.time);

    const quoteTimes = quoteHist.map((p: Point) => p.time);
    const quoteValues = quoteHist.map((p: Point) => p.value ?? 1);

    // ---------------------------------------------------------
    // TYPED nearestValue() — no more implicit any
    // ---------------------------------------------------------
    const nearestValue = (t: number): number => {
      let lo = 0;
      let hi = quoteTimes.length - 1;

      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (quoteTimes[mid] < t) lo = mid + 1;
        else hi = mid;
      }

      const v = quoteValues[lo];
      return Number.isFinite(v) ? (v as number) : 1;
    };

    // ---------------------------------------------------------
    // MERGE (typed)
    // ---------------------------------------------------------
    const merged: Point[] = baseHist
      .map((pt: Point): Point => {
        const q = nearestValue(pt.time);
        const val = Number(pt.value) / q;

        return {
          time: pt.time,
          value: Number.isFinite(val) ? val : null,
        };
      })
      .filter((pt: Point) => Number.isFinite(pt.value))
      .sort((a: Point, b: Point) => a.time - b.time);

    return Response.json({ history: merged });
  } catch (e) {
    return Response.json({ history: [] });
  }
}
