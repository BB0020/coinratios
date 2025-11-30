"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType } from "lightweight-charts";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
  market_cap?: number;
}

const DEFAULT_FROM: Coin = {
  id: "bitcoin",
  symbol: "btc",
  name: "Bitcoin",
  image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  type: "crypto",
};

const DEFAULT_TO: Coin = {
  id: "usd",
  symbol: "usd",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

const RANGE_MAP: Record<
  string,
  { days: number; interval: "daily" | "hourly" }
> = {
  "24H": { days: 1, interval: "hourly" },
  "7D": { days: 7, interval: "hourly" },
  "1M": { days: 30, interval: "hourly" },
  "3M": { days: 90, interval: "hourly" },
  "6M": { days: 180, interval: "daily" },
  "1Y": { days: 365, interval: "daily" },
  ALL: { days: 5000, interval: "daily" }, // auto-max
};

export default function Page() {
  // ------------------------------
  // STATE (never null)
  // ------------------------------
  const [amount, setAmount] = useState("1");
  const [fromCoin, setFromCoin] = useState<Coin>(DEFAULT_FROM);
  const [toCoin, setToCoin] = useState<Coin>(DEFAULT_TO);
  const [range, setRange] = useState("24H");
  const [price, setPrice] = useState<number | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);

  // Chart refs
  const chartRef = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<any>(null);
  const chartInstanceRef = useRef<any>(null);

  // ------------------------------
  // FETCH PRICE
  // ------------------------------
  async function fetchPrice() {
    if (!fromCoin || !toCoin) return;
    setLoadingPrice(true);

    try {
      const url = `/api/price?from=${fromCoin.id}&to=${toCoin.id}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data?.price) {
        setPrice(data.price);
      }
    } catch (err) {
      console.error("Price error:", err);
    }

    setLoadingPrice(false);
  }

  // ------------------------------
  // FETCH CHART DATA
  // ------------------------------
  async function fetchChart(rangeKey: string) {
    if (!fromCoin || !toCoin) return;

    setChartLoading(true);

    const r = RANGE_MAP[rangeKey];

    try {
      const url = `/api/history?from=${fromCoin.id}&to=${toCoin.id}&days=${r.days}&interval=${r.interval}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data || !Array.isArray(data)) {
        console.warn("Bad chart data");
        return;
      }

      if (seriesRef.current) {
        seriesRef.current.setData(data);
      }
    } catch (err) {
      console.error("Chart load error:", err);
    }

    setChartLoading(false);
  }

  // ------------------------------
  // INIT CHART ONCE
  // ------------------------------
  useEffect(() => {
    if (!chartRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");
    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 390,
      layout: {
        background: { color: isDark ? "#111111" : "#ffffff" },
        textColor: isDark ? "#eeeeee" : "#1a1a1a",
      },
      grid: {
        vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
      bottomColor: "rgba(0,0,0,0)",
    });

    chartInstanceRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      chart.applyOptions({
        width: chartRef.current?.clientWidth || 400,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // ------------------------------
  // THEME CHANGE → UPDATE CHART
  // ------------------------------
  useEffect(() => {
    function updateTheme() {
      if (!chartInstanceRef.current || !seriesRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");

      chartInstanceRef.current.applyOptions({
        layout: {
          background: { color: isDark ? "#111111" : "#ffffff" },
          textColor: isDark ? "#eeeeee" : "#1a1a1a",
        },
        grid: {
          vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
          horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        },
      });

      seriesRef.current.applyOptions({
        lineColor: isDark ? "#4ea1f7" : "#3b82f6",
        topColor: isDark
          ? "rgba(78,161,247,0.35)"
          : "rgba(59,130,246,0.35)",
        bottomColor: "rgba(0,0,0,0)",
      });
    }

    window.addEventListener("theme-change", updateTheme);
    return () => window.removeEventListener("theme-change", updateTheme);
  }, []);

  // ------------------------------
  // Fetch price whenever coins change
  // ------------------------------
  useEffect(() => {
    fetchPrice();
  }, [fromCoin, toCoin]);

  // ------------------------------
  // Fetch chart when range changes or coins change
  // ------------------------------
  useEffect(() => {
    fetchChart(range);
  }, [range, fromCoin, toCoin]);

  // ------------------------------
  // UI HANDLERS
  // ------------------------------
  function swap() {
    setFromCoin(toCoin);
    setToCoin(fromCoin);
  }

  const validAmount = parseFloat(amount) > 0;

  return (
    <div className="px-6 max-w-5xl mx-auto pt-10">
      {/* Amount */}
      <label className="block mb-2">AMOUNT</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full text-3xl"
        placeholder="1"
      />
      {!validAmount && (
        <div className="error-text">Enter a Number Greater than 0</div>
      )}

      {/* FROM + SWAP + TO */}
      <div className="flex items-center gap-6 mt-8">
        {/* FROM */}
        <div className="flex-1">
          <label className="block mb-2">FROM</label>
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
            <img src={fromCoin.image} className="w-10 h-10 mr-4" />
            <div>
              <div className="text-xl font-semibold uppercase">
                {fromCoin.symbol}
              </div>
              <div className="text-gray-500 dark:text-gray-400 text-sm">
                {fromCoin.name}
              </div>
            </div>
          </div>
        </div>

        {/* SWAP */}
        <div className="swap-circle" onClick={swap}>
          <span className="text-2xl">⇄</span>
        </div>

        {/* TO */}
        <div className="flex-1">
          <label className="block mb-2">TO</label>
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
            <img src={toCoin.image} className="w-10 h-10 mr-4" />
            <div>
              <div className="text-xl font-semibold uppercase">
                {toCoin.symbol}
              </div>
              <div className="text-gray-500 dark:text-gray-400 text-sm">
                {toCoin.name}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN RESULT */}
      <div className="text-center mt-12">
        <div className="text-5xl font-bold mb-4">
          {loadingPrice || price === null
            ? "Loading..."
            : `${(parseFloat(amount || "0") * (price || 0)).toLocaleString()} ${
                toCoin.symbol.toUpperCase()
              }`}
        </div>

        {/* SMALL LINES */}
        {price !== null && (
          <div className="mt-4 space-y-1 text-center">
            <div className="small-line">
              1 {fromCoin.symbol.toUpperCase()} ={" "}
              {price.toLocaleString()} {toCoin.symbol.toUpperCase()}
            </div>

            <div className="small-line">
              1 {toCoin.symbol.toUpperCase()} ={" "}
              {(1 / price).toPrecision(8)}{" "}
              {fromCoin.symbol.toUpperCase()}
            </div>
          </div>
        )}
      </div>

      {/* RANGE BUTTONS */}
      <div className="flex justify-center gap-4 mt-10">
        {Object.keys(RANGE_MAP).map((key) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className={`px-5 py-2 rounded-xl ${
              range === key
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {/* CHART */}
      <div className="mt-8 chart-container" ref={chartRef}></div>
    </div>
  );
}
