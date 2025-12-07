// /app/api/history/route.ts
// Final working version for CoinGecko hourly data with Pro/Demo API keys
// ----------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface Point {
  time: number;
  value: number;
}

/* ----------------------------------------
   HEADERS FOR COINGECKO PRO/DEMO API
---------------------------------------- */
const CG_HEADERS = {
  accept: "application/json",
  "User-Agent": "coinratios/1.0",
  "x-cg-pro-api-key": process.env.CG_KEY ?? "",
};

/* ----------------------------------------
   Resolve correct CoinGecko ID
---------------------------------------- */
async function resolveId(sym: string): Promise<string> {
  const r = await fetch(
    "https://api.coingecko.com/api/v3/coins/list?include_platform=false",
    { headers: CG_HEADERS }
  );
  if (!r.ok) return sym;

  const list = await r.json();

  const exact = list.find((c: any) => c.id === sym);
  if (exact) return exact.id;

  const bySymbol = list.find(
    (c: any) => c.symbol.toLowerCase() === sym.toLowerCase()
  );

  return bySymbol?.id ?? sym;
}

const isFiat = (id: string) =>
  ["usd", "eur", "gbp", "cad", "jpy", "chf", "aud"].includes(id.toLowerCase());

/* ----------------------------------------
   Fetch Crypto Market Chart (HOURLY)
---------------------------------------- */
async function fetchCrypto(id: string, days: number): Promise<Point[]> {
  const realId = await resolveId(id);

  const url = `https://api.coingecko.com/api/v3/coins/${realId}/market_chart?vs_currency=usd&days=${days}`;

  const r = await fetch(url, {
    method: "GET",
    headers: CG_HEADERS,
    cache: "no-store",
  });

  if (!r.ok) {
    console.error("CoinGecko Error", r.status, await r.text());
    return [];
  }

  const j = await r.json();
  if (!j.prices) return [];

  return j.prices.map(([ts, price]: any) => ({
    time: Math.floor(ts / 1000),
    value: price,
  }));
}

/* ----------------------------------------
   Fetch Fiat Data (Daily)
---------------------------------------- */
async function fetchFiat(symbol: string, days: number): Promise<Point[]> {
  const sym = symbol.toUpperCase();

  if (sym === "USD") {
    const now = Date.now() / 1000;
    return Array.from({ length: days + 1 }).map((_, i) => ({
      time: Math.floor(now - (days - i) * 86400),
      value: 1,
    }));
  }

  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
  );

  const url = `https://api.frankfurter.app/${start
    .toISOString()
    .slice(0, 10)}..${end
    .toISOString()
    .slice(0, 10)}?from=USD&to=${sym}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return [];

  const j = await r.json();

  const raw: Point[] = Object.keys(j.rates)
    .map((day) => ({
      time: Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000),
      value: 1 / j.rates[day][sym],
    }))
    .sort((a, b) => a.time - b.time);

  return raw;
}

/* ----------------------------------------
   Expand fiat to match crypto timestamps
---------------------------------------- */
function expandFiat(fiat: Point[], crypto: Point[]): Point[] {
  if (fiat.length === 0) return fiat;

  const map = new Map(fiat.map((p) => [p.time, p.value]));
  let last = fiat[0].value;

  return crypto.map((c) => {
    const aligned = c.time - (c.time % 86400);
    if (map.has(aligned)) last = map.get(aligned)!;

    return { time: c.time, value: last };
  });
}

/* ----------------------------------------
   Merge two time series safely
---------------------------------------- */
function mergeByTime(A: Point[], B: Point[]) {
  const out: Point[] = [];
  const len = Math.min(A.length, B.length);

  for (let i = 0; i < len; i++) {
    const v = A[i].value / B[i].value;
    if (Number.isFinite(v)) {
      out.push({
        time: A[i].time,
        value: v,
      });
    }
  }
  return out;
}

/* ----------------------------------------
   MAIN API HANDLER
---------------------------------------- */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const base = url.searchParams.get("base")!;
    const quote = url.searchParams.get("quote")!;
    const days = Number(url.searchParams.get("days") ?? 30);

    if (!base || !quote) return Response.json({ history: [] });

    const [Araw, Braw] = await Promise.all([
      isFiat(base) ? fetchFiat(base, days) : fetchCrypto(base, days),
      isFiat(quote) ? fetchFiat(quote, days) : fetchCrypto(quote, days),
    ]);

    if (!Araw.length || !Braw.length) return Response.json({ history: [] });

    const A =
      isFiat(base) && !isFiat(quote)
        ? expandFiat(Araw, Braw)
        : Araw;

    const B =
      isFiat(quote) && !isFiat(base)
        ? expandFiat(Braw, Araw)
        : Braw;

    const merged = mergeByTime(A, B);

    return Response.json({ history: merged });
  } catch (err) {
    console.error("API /history error:", err);
    return Response.json({ history: [] });
  }
}