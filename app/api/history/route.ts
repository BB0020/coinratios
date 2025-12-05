// /app/api/history/route.ts
export const revalidate = 300; // cache 5 min

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const base = searchParams.get("base");    // crypto ID or fiat symbol
  const quote = searchParams.get("quote");  // crypto ID or fiat symbol
  const days = Number(searchParams.get("days") ?? 30);

  if (!base || !quote) {
    return Response.json({ history: [] });
  }

  try {
    // helpers
    const fetchCrypto = async (id: string) => {
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
      const r = await fetch(url, { next: { revalidate: 300 } });
      const d = await r.json();

      return (d.prices ?? []).map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    };

    const fetchFiat = async (symbol: string) => {
      if (symbol === "USD") {
        const out = [];
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

      return Object.keys(d.rates).map((day) => {
        const usdToFiat = d.rates[day][symbol];
        return {
          time: Math.floor(new Date(day).getTime() / 1000),
          value: 1 / usdToFiat,
        };
      });
    };

    // load both sides in parallel
    const [baseHist, quoteHist] = await Promise.all([
      /\d/.test(base) ? fetchCrypto(base) : fetchFiat(base),
      /\d/.test(quote) ? fetchCrypto(quote) : fetchFiat(quote),
    ]);

    // merge (binary search for nearest)
    const merge = (a: any[], b: any[]) => {
      const out = [];

      const timesB = b.map((pt) => pt.time);
      const valuesB = b.map((pt) => pt.value);

      const nearest = (t: number) => {
        // binary search
        let lo = 0,
          hi = timesB.length - 1;

        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (timesB[mid] < t) lo = mid + 1;
          else hi = mid;
        }

        return valuesB[lo] ?? valuesB[valuesB.length - 1];
      };

      for (const pt of a) {
        out.push({
          time: pt.time,
          value: pt.value / nearest(pt.time),
        });
      }

      return out;
    };

    return Response.json({ history: merge(baseHist, quoteHist) });
  } catch (e) {
    return Response.json({ history: [] });
  }
}
