"use client";

import {
  useState,
  useEffect,
  useRef,
  ChangeEvent,
} from "react";
import {
  createChart,
  UTCTimestamp,
  IChartApi,
  ISeriesApi,
  AreaData,
} from "lightweight-charts";

/* ===========================================================
   TYPES
=========================================================== */
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  type: "crypto" | "fiat";
}

interface HistoryPoint {
  time: UTCTimestamp;
  value: number;
}

/* ===========================================================
   STATIC FIAT LIST
=========================================================== */
const fiatList: Coin[] = [
  { id: "USD", symbol: "USD", name: "US Dollar", type: "fiat" },
  { id: "EUR", symbol: "EUR", name: "Euro", type: "fiat" },
  { id: "CAD", symbol: "CAD", name: "Canadian Dollar", type: "fiat" },
  { id: "GBP", symbol: "GBP", name: "British Pound", type: "fiat" },
  { id: "AUD", symbol: "AUD", name: "Australian Dollar", type: "fiat" },
  { id: "CHF", symbol: "CHF", name: "Swiss Franc", type: "fiat" },
];

const USD: Coin = { id: "USD", symbol: "USD", name: "US Dollar", type: "fiat" };

/* ===========================================================
   CACHES
=========================================================== */
const cryptoHistoryCache: Record<string, HistoryPoint[]> = {};
const fiatHistoryCache: Record<string, HistoryPoint[]> = {};

/* ===========================================================
   PAGE COMPONENT
=========================================================== */
export default function Page() {
  /* ------------------------------
        STATE
  ------------------------------ */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);
  const [amount, setAmount] = useState("1");
  const [range, setRange] = useState("24H");

  const [conversion, setConversion] = useState<{
    fromUSD: number;
    toUSD: number;
    result: number;
  }>({ fromUSD: 0, toUSD: 0, result: 0 });

  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lastValidData = useRef<HistoryPoint[]>([]);

  /* ===========================================================
        LOAD COINS
  ============================================================ */
  useEffect(() => {
    async function load() {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      );
      const d = await r.json();

      const cryptos: Coin[] = d.map((c: any) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        image: c.image,
        type: "crypto" as const,
      }));

      const finalList = [USD, ...cryptos, ...fiatList];
      setAllCoins(finalList);

      setFromCoin(finalList.find((x) => x.id === "bitcoin") || finalList[0]);
      setToCoin(USD);
    }
    load();
  }, []);

  /* ===========================================================
        HELPER: MERGE HOURLY + DAILY
  ============================================================ */
  function mergeHistory(
    daily: HistoryPoint[],
    hourly: HistoryPoint[]
  ): HistoryPoint[] {
    const map: Record<number, number> = {};

    daily.forEach((p: HistoryPoint) => {
      map[p.time] = p.value;
    });

    hourly.forEach((p: HistoryPoint) => {
      map[p.time] = p.value;
    });

    return Object.entries(map)
      .map(([t, v]) => ({
        time: Number(t) as UTCTimestamp,
        value: v as number,
      }))
      .sort((a, b) => a.time - b.time);
  }

  /* ===========================================================
        CRYPTO HISTORY
  ============================================================ */
  async function cryptoHistory(id: string): Promise<HistoryPoint[]> {
    if (cryptoHistoryCache[id]) return cryptoHistoryCache[id];

    const hrReq = fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=90&interval=hourly`
    );
    const dyReq = fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`
    );

    const [hrRes, dyRes] = await Promise.all([hrReq, dyReq]);
    const hr = await hrRes.json();
    const dy = await dyRes.json();

    const hourly =
      hr.prices?.map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000) as UTCTimestamp,
        value: p[1],
      })) ?? [];

    const daily =
      dy.prices?.map((p: [number, number]) => ({
        time: Math.floor(p[0] / 1000) as UTCTimestamp,
        value: p[1],
      })) ?? [];

    const merged = mergeHistory(daily, hourly);
    cryptoHistoryCache[id] = merged;
    return merged;
  }

  /* ===========================================================
        FIAT HISTORY (DAILY ONLY)
  ============================================================ */
  async function fiatHistory(symbol: string): Promise<HistoryPoint[]> {
    if (fiatHistoryCache[symbol]) return fiatHistoryCache[symbol];

    const url = `https://api.exchangerate.host/timeseries?base=${symbol}&symbols=USD&start_date=2020-01-01&end_date=2030-01-01`;

    const r = await fetch(url);
    const d = await r.json();

    const arr: HistoryPoint[] = Object.entries(d.rates).map(
      ([date, v]: any) => ({
        time: Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp,
        value: v.USD,
      })
    );

    arr.sort((a, b) => a.time - b.time);

    fiatHistoryCache[symbol] = arr;
    return arr;
  }

  /* ===========================================================
        COMPUTE HISTORY
  ============================================================ */
  async function computeHistory() {
    if (!fromCoin || !toCoin) return;

    const fromIsCrypto = fromCoin.type === "crypto";
    const toIsCrypto = toCoin.type === "crypto";

    const fromHistory = fromIsCrypto
      ? await cryptoHistory(fromCoin.id)
      : await fiatHistory(fromCoin.symbol);

    const toHistory = toIsCrypto
      ? await cryptoHistory(toCoin.id)
      : await fiatHistory(toCoin.symbol);

    // Ratio = fromUSD / toUSD
    const ratio: HistoryPoint[] = [];

    let i = 0;
    let j = 0;

    while (i < fromHistory.length && j < toHistory.length) {
      if (fromHistory[i].time === toHistory[j].time) {
        ratio.push({
          time: fromHistory[i].time,
          value: fromHistory[i].value / toHistory[j].value,
        });
        i++;
        j++;
      } else if (fromHistory[i].time < toHistory[j].time) {
        i++;
      } else j++;
    }

    lastValidData.current = ratio;

    // Apply range
    const now = Math.floor(Date.now() / 1000);
    const cut =
      range === "24H"
        ? now - 24 * 3600
        : range === "7D"
        ? now - 7 * 86400
        : range === "1M"
        ? now - 30 * 86400
        : range === "3M"
        ? now - 90 * 86400
        : range === "6M"
        ? now - 180 * 86400
        : now - 365 * 86400;

    const filtered = ratio.filter((p) => p.time >= cut);

    if (areaSeriesRef.current) {
      areaSeriesRef.current.setData(filtered);
    }
  }

  /* ===========================================================
        CONVERSION CALCULATION
  ============================================================ */
  useEffect(() => {
    async function compute() {
      if (!fromCoin || !toCoin) return;

      const fromIsCrypto = fromCoin.type === "crypto";
      const toIsCrypto = toCoin.type === "crypto";

      const fromPrice = fromIsCrypto
        ? (await cryptoHistory(fromCoin.id)).at(-1)?.value ?? 0
        : (await fiatHistory(fromCoin.symbol)).at(-1)?.value ?? 0;

      const toPrice = toIsCrypto
        ? (await cryptoHistory(toCoin.id)).at(-1)?.value ?? 0
        : (await fiatHistory(toCoin.symbol)).at(-1)?.value ?? 0;

      const amt = Number(amount) || 0;
      const result = (amt * fromPrice) / toPrice;

      setConversion({
        fromUSD: fromPrice,
        toUSD: toPrice,
        result,
      });
    }
    compute();
  }, [fromCoin, toCoin, amount]);

  /* ===========================================================
        INIT CHART
  ============================================================ */
  useEffect(() => {
    if (!chartRef.current) return;

    chartInstance.current?.remove();

    const chart = createChart(chartRef.current, {
      height: 380,
      layout: { textColor: "#000", background: { color: "transparent" } },
      grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
      timeScale: { borderColor: "#ccc" },
    });

    const area = chart.addAreaSeries({
      lineColor: "#3b82f6",
      topColor: "rgba(59,130,246,0.4)",
      bottomColor: "rgba(59,130,246,0)",
    });

    chartInstance.current = chart;
    areaSeriesRef.current = area;

    computeHistory();
  }, [fromCoin, toCoin]);

  /* ===========================================================
        REFRESH WHEN RANGE CHANGES
  ============================================================ */
  useEffect(() => {
    computeHistory();
  }, [range]);

  /* ===========================================================
        SWAP
  ============================================================ */
  function handleSwap() {
    if (!fromCoin || !toCoin) return;
    const f = fromCoin;
    setFromCoin(toCoin);
    setToCoin(f);

    if (fromCoin.type === "fiat" && toCoin.type === "fiat") {
      if (range === "24H") setRange("7D");
    }
  }

  /* ===========================================================
        FIAT-FIAT: HIDE 24H
=========================================================== */
  const hide24h =
    fromCoin?.type === "fiat" && toCoin?.type === "fiat";

  if (hide24h && range === "24H") {
    setRange("7D");
  }

  /* ===========================================================
        UI
=========================================================== */
  return (
    <div className="page-container">

      {/* ======================== INPUTS ======================== */}
      <div className="top-row">
        <div className="amount-box">
          <label>AMOUNT</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="coin-box">
          <label>FROM</label>
          <select
            value={fromCoin?.id || ""}
            onChange={(e) =>
              setFromCoin(allCoins.find((c) => c.id === e.target.value) || null)
            }
          >
            {allCoins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.symbol}
              </option>
            ))}
          </select>
        </div>

        <button className="swap-btn" onClick={handleSwap}>⇅</button>

        <div className="coin-box">
          <label>TO</label>
          <select
            value={toCoin?.id || ""}
            onChange={(e) =>
              setToCoin(allCoins.find((c) => c.id === e.target.value) || null)
            }
          >
            {allCoins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ======================== RESULTS ======================== */}
      <div className="result-section">
        <h2>
          {amount} {fromCoin?.symbol} → {toCoin?.symbol}
        </h2>

        <div className="result-big">
          {conversion.result.toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}{" "}
          {toCoin?.symbol}
        </div>

        <div className="sub-info">
          1 {fromCoin?.symbol} ={" "}
          {(conversion.fromUSD / conversion.toUSD).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}{" "}
          {toCoin?.symbol}
        </div>
      </div>

      {/* ======================== RANGE BUTTONS ======================== */}
      <div className="range-row">
        {!hide24h && (
          <button
            className={range === "24H" ? "active" : ""}
            onClick={() => setRange("24H")}
          >
            24H
          </button>
        )}
        <button
          className={range === "7D" ? "active" : ""}
          onClick={() => setRange("7D")}
        >
          7D
        </button>
        <button
          className={range === "1M" ? "active" : ""}
          onClick={() => setRange("1M")}
        >
          1M
        </button>
        <button
          className={range === "3M" ? "active" : ""}
          onClick={() => setRange("3M")}
        >
          3M
        </button>
        <button
          className={range === "6M" ? "active" : ""}
          onClick={() => setRange("6M")}
        >
          6M
        </button>
        <button
          className={range === "1Y" ? "active" : ""}
          onClick={() => setRange("1Y")}
        >
          1Y
        </button>
      </div>

      {/* ======================== CHART ======================== */}
      <div className="chart-wrapper">
        <div ref={chartRef} className="chart-area" />
      </div>
    </div>
  );
}
