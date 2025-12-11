"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart, type UTCTimestamp } from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

interface HistoryPoint {
  time: number;
  value: number;
}

// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------
const ranges = [
  { label: "24H", days: 1 },
  { label: "7D", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

// ------------------------------------------------------------
// MAIN PAGE COMPONENT
// ------------------------------------------------------------
export default function Page() {
  const [amount, setAmount] = useState("1");
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);
  const [range, setRange] = useState("7D");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  // forward-only cache
  const historyCache = useRef<Record<string, HistoryPoint[]>>({});

  // ------------------------------------------------------------
  // LOAD COINS (TOP 300 + FIATS)
  // ------------------------------------------------------------
  useEffect(() => {
    async function loadCoins() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=300&page=1&sparkline=false"
        );
        const crypto = await res.json();

        const cryptoCoins: Coin[] = crypto.map((c: any) => ({
          id: c.id,
          symbol: c.symbol,
          name: c.name,
          image: c.image,
          type: "crypto",
        }));

        const fiats: Coin[] = [
          { id: "usd", symbol: "usd", name: "US Dollar", image: "https://flagcdn.com/us.svg", type: "fiat" },
          { id: "eur", symbol: "eur", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
          { id: "gbp", symbol: "gbp", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
          { id: "jpy", symbol: "jpy", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
          { id: "cad", symbol: "cad", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
          { id: "aud", symbol: "aud", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
          { id: "chf", symbol: "chf", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
          { id: "hkd", symbol: "hkd", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
          { id: "nzd", symbol: "nzd", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
        ];

        const coins = [...fiats, ...cryptoCoins];
        setAllCoins(coins);

        const btc = coins.find((c) => c.id === "bitcoin")!;
        const usd = coins.find((c) => c.id === "usd")!;
        setFromCoin(btc);
        setToCoin(usd);
      } catch (e) {
        console.error("COIN LOAD ERROR:", e);
      }
    }
    loadCoins();
  }, []);

  // ------------------------------------------------------------
  // FETCH HISTORY (FORWARD ONLY)
  // NEVER fetch reverse — always invert cached forward
  // ------------------------------------------------------------
  const getHistory = useCallback(async (base: Coin, quote: Coin, days: number): Promise<HistoryPoint[]> => {
    const forwardKey = `${base.id}-${quote.id}-${days}`;
    const reverseKey = `${quote.id}-${base.id}-${days}`;

    // Forward exists → return immediately
    if (historyCache.current[forwardKey]) {
      return historyCache.current[forwardKey];
    }

    // Reverse exists → invert
    if (historyCache.current[reverseKey]) {
      const inverted = historyCache.current[reverseKey].map((p) => ({
        time: p.time,
        value: 1 / p.value,
      }));
      historyCache.current[forwardKey] = inverted;
      return inverted;
    }

    // Fetch base→usd and quote→usd
    const urlA = `/api/history?base=${base.id}&quote=usd&days=${days}`;
    const urlB = `/api/history?base=${quote.id}&quote=usd&days=${days}`;
    const [resA, resB] = await Promise.all([
      fetch(urlA).then((r) => r.json()),
      fetch(urlB).then((r) => r.json()),
    ]);

    const aHist: HistoryPoint[] = resA.history;
    const bHist: HistoryPoint[] = resB.history;

    if (!aHist?.length || !bHist?.length) return [];

    // Align timestamps
    const mapB = new Map(bHist.map((p) => [p.time, p.value]));
    const aligned: HistoryPoint[] = [];
    for (const p of aHist) {
      if (mapB.has(p.time)) {
        const bVal = mapB.get(p.time)!; // Non-null
        aligned.push({
          time: p.time,
          value: p.value / bVal,
        });
      }
    }

    historyCache.current[forwardKey] = aligned;
    return aligned;
  }, []);

  // ------------------------------------------------------------
  // BUILD / UPDATE CHART
  // ------------------------------------------------------------
  const buildChart = useCallback(
    async (base: Coin, quote: Coin, rangeLabel: string) => {
      const days = ranges.find((r) => r.label === rangeLabel)!.days;

      const hist = await getHistory(base, quote, days);
      if (!hist || hist.length < 2) return;

      if (!chartRef.current) {
        const chart = createChart(chartContainerRef.current!, {
          width: chartContainerRef.current!.clientWidth,
          height: 400,
          layout: {
            background: { color: "transparent" },
            textColor: "var(--text-color)",
          },
          grid: {
            vertLines: { color: "rgba(0,0,0,0.1)" },
            horzLines: { color: "rgba(0,0,0,0.1)" },
          },
          rightPriceScale: {
            borderColor: "rgba(197,203,206,0.8)",
          },
          timeScale: {
            borderColor: "rgba(197,203,206,0.8)",
            timeVisible: true,
            secondsVisible: false,
          },
        });

        chartRef.current = chart;
        seriesRef.current = chart.addAreaSeries({
          lineColor: "#2962FF",
          topColor: "rgba(41,98,255,0.4)",
          bottomColor: "rgba(41,98,255,0.1)",
        });
      }

      seriesRef.current.setData(
        hist.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
        }))
      );

      chartRef.current.timeScale().fitContent();
    },
    [getHistory]
  );

  // ------------------------------------------------------------
  // WHENEVER USER CHANGES COIN OR RANGE → REBUILD CHART
  // ------------------------------------------------------------
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    if (!chartContainerRef.current) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        buildChart(fromCoin, toCoin, range);
      });
    });
  }, [fromCoin, toCoin, range, buildChart]);

  // ------------------------------------------------------------
  // UI RENDER
  // ------------------------------------------------------------
  return (
    <div className="page-wrapper">
      <ThemeToggle />

      {/* AMOUNT INPUT */}
      <div className="amount-row">
        <input
          className="amount-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {/* FROM + TO SELECTORS */}
      <div className="selector-row">
        {/* FROM */}
        <div className="coin-box">
          <img className="coin-img" src={fromCoin?.image} alt="" />
          <select
            className="coin-select"
            value={fromCoin?.id || ""}
            onChange={(e) => {
              const coin = allCoins.find((c) => c.id === e.target.value);
              if (coin) setFromCoin(coin);
            }}
          >
            {allCoins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* SWAP BUTTON */}
        <button
          className="swap-button"
          onClick={() => {
            if (fromCoin && toCoin) {
              const oldFrom = fromCoin;
              const oldTo = toCoin;
              setFromCoin(oldTo);
              setToCoin(oldFrom);
            }
          }}
        >
          ⇅
        </button>

        {/* TO */}
        <div className="coin-box">
          <img className="coin-img" src={toCoin?.image} alt="" />
          <select
            className="coin-select"
            value={toCoin?.id || ""}
            onChange={(e) => {
              const coin = allCoins.find((c) => c.id === e.target.value);
              if (coin) setToCoin(coin);
            }}
          >
            {allCoins.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* RANGE BUTTONS */}
      <div className="range-row">
        {ranges.map((r) => (
          <button
            key={r.label}
            className={`range-btn ${range === r.label ? "active" : ""}`}
            onClick={() => setRange(r.label)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* CHART */}
      <div
        ref={chartContainerRef}
        style={{
          width: "100%",
          height: "400px",
          marginTop: "35px",
          borderRadius: "14px",
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
        }}
      />
    </div>
  );
}
