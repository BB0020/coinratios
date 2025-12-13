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
const USD: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

const FIAT_LIST: Coin[] = [
  { id: "AUD", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
  { id: "BRL", symbol: "BRL", name: "Brazilian Real", image: "https://flagcdn.com/br.svg", type: "fiat" },
  { id: "CAD", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
  { id: "CHF", symbol: "CHF", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
  { id: "CNY", symbol: "CNY", name: "Chinese Yuan", image: "https://flagcdn.com/cn.svg", type: "fiat" },
  { id: "DKK", symbol: "DKK", name: "Danish Krone", image: "https://flagcdn.com/dk.svg", type: "fiat" },
  { id: "EUR", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
  { id: "GBP", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
  { id: "HKD", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
  { id: "INR", symbol: "INR", name: "Indian Rupee", image: "https://flagcdn.com/in.svg", type: "fiat" },
  { id: "JPY", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
  { id: "KRW", symbol: "KRW", name: "South Korean Won", image: "https://flagcdn.com/kr.svg", type: "fiat" },
  { id: "MXN", symbol: "MXN", name: "Mexican Peso", image: "https://flagcdn.com/mx.svg", type: "fiat" },
  { id: "NOK", symbol: "NOK", name: "Norwegian Krone", image: "https://flagcdn.com/no.svg", type: "fiat" },
  { id: "NZD", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
  { id: "SEK", symbol: "SEK", name: "Swedish Krona", image: "https://flagcdn.com/se.svg", type: "fiat" },
  { id: "SGD", symbol: "SGD", name: "Singapore Dollar", image: "https://flagcdn.com/sg.svg", type: "fiat" },
  { id: "TRY", symbol: "TRY", name: "Turkish Lira", image: "https://flagcdn.com/tr.svg", type: "fiat" },
  { id: "ZAR", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
];

// ------------------------------------------------------------
// PAGE COMPONENT
// ------------------------------------------------------------
export default function Page() {
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [amount, setAmount] = useState("1");
  const [range, setRange] = useState("24H");
  const [result, setResult] = useState<number | null>(null);

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const historyCache = useRef<Record<string, HistoryPoint[]>>({});
  const realtimeCache = useRef<Record<string, number>>({});

  // ------------------------------------------------------------
  // LOAD COINS
  // ------------------------------------------------------------
  useEffect(() => {
    async function loadCoins() {
      const r = await fetch("/api/coins");
      const d = await r.json();

      const cryptoList = d.coins ?? [];
      const final = [USD, ...cryptoList, ...FIAT_LIST];
      setAllCoins(final);

      const btc = final.find((c) => c.id === "bitcoin");
      setFromCoin(btc || final[1]);
      setToCoin(USD);
    }
    loadCoins();
  }, []);

  // ------------------------------------------------------------
  // FILTER COINS
  // ------------------------------------------------------------
  const filteredCoins = useCallback(
    (q: string) => {
      const s = q.toLowerCase();
      return allCoins.filter(
        (c) =>
          c.symbol.toLowerCase().includes(s) ||
          c.name.toLowerCase().includes(s)
      );
    },
    [allCoins]
  );

  // ------------------------------------------------------------
  // REALTIME PRICE
  // ------------------------------------------------------------
  const getRealtime = useCallback(async (coin: Coin) => {
    const key = coin.id;
    if (realtimeCache.current[key]) return realtimeCache.current[key];

    const r = await fetch(`/api/price?base=${coin.id}&quote=usd`);
    const j = await r.json();
    const price = typeof j.price === "number" ? j.price : 0;

    realtimeCache.current[key] = price;
    return price;
  }, []);

  // ------------------------------------------------------------
  // COMPUTE RESULT
  // ------------------------------------------------------------
  useEffect(() => {
    async function compute() {
      if (!fromCoin || !toCoin) return;

      const amt = Number(amount);
      if (amt <= 0) return setResult(null);

      const [a, b] = await Promise.all([
        getRealtime(fromCoin),
        getRealtime(toCoin),
      ]);

      setResult((a / b) * amt);
    }

    const t = setTimeout(compute, 100);
    return () => clearTimeout(t);
  }, [amount, fromCoin, toCoin, getRealtime]);

  // ------------------------------------------------------------
  // RANGE → DAYS
  // ------------------------------------------------------------
  const rangeToDays = (r: string) =>
    r === "24H" ? 1 :
    r === "7D"  ? 7 :
    r === "1M"  ? 30 :
    r === "3M"  ? 90 :
    r === "6M"  ? 180 :
                  365;

  // ------------------------------------------------------------
  // RAW HISTORY
  // ------------------------------------------------------------
  const getHistory = useCallback(async (base: Coin, quote: Coin, days: number) => {
    const key = `${base.id}-${quote.id}-${days}`;
    if (historyCache.current[key]) return historyCache.current[key];

    const r = await fetch(`/api/history?base=${base.id}&quote=${quote.id}&days=${days}`);
    const d = await r.json();

    const cleaned = (d.history ?? [])
      .filter((p: HistoryPoint) => Number.isFinite(p.value))
      .sort((a: HistoryPoint, b: HistoryPoint) => a.time - b.time);

    historyCache.current[key] = cleaned;
    return cleaned;
  }, []);

  // ------------------------------------------------------------
  // NORMALIZED HISTORY
  // ------------------------------------------------------------
  const getNormalizedHistory = useCallback(async (base: Coin, quote: Coin, days: number) => {
    let forwardBase = base;
    let forwardQuote = quote;
    let invert = false;

    if (base.type === "fiat") {
      forwardBase = quote;
      forwardQuote = base;
      invert = true;
    }

    const hist = await getHistory(forwardBase, forwardQuote, days);
    if (!invert) return hist;

    return hist.map((p: HistoryPoint) => ({
      time: p.time,
      value: p.value ? 1 / p.value : 0,
    }));
  }, [getHistory]);

  // ------------------------------------------------------------
  // CHART BUILDER + TOOLTIP ABOVE CURSOR
  // ------------------------------------------------------------
  const build = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const container = chartContainerRef.current;
    if (!container) return;

    const hist = await getNormalizedHistory(fromCoin, toCoin, rangeToDays(range));
    if (!hist.length) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const oldTooltip = container.querySelector(".cg-tooltip");
    if (oldTooltip) oldTooltip.remove();

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 390,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#e5e7eb" : "#374151",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: UTCTimestamp) => {
          const d = new Date(t * 1000);
          return range === "24H"
            ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
            : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        },
      },
      crosshair: {
        mode: 2,
        vertLine: { width: 1, color: isDark ? "#94a3b8" : "#cbd5e1" },
        horzLine: { visible: false },
      },
    });

    const series = chart.addLineSeries({
      lineWidth: 2,
      color: isDark ? "#4ea1f7" : "#3b82f6",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    series.setData(
      hist.map((p: HistoryPoint) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      }))
    );

    chart.timeScale().fitContent();

    const tooltip = document.createElement("div");
    tooltip.className = "cg-tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.visibility = "hidden";
    tooltip.style.padding = "10px 14px";
    tooltip.style.borderRadius = "10px";
    tooltip.style.background = isDark ? "#1f2937" : "#ffffff";
    tooltip.style.color = isDark ? "#f9fafb" : "#111";
    tooltip.style.boxShadow = "0 4px 14px rgba(0,0,0,0.15)";
    tooltip.style.fontSize = "13px";
    container.appendChild(tooltip);

    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.point || !param.seriesPrices) {
        tooltip.style.visibility = "hidden";
        return;
      }

      const price = param.seriesPrices.get(series);
      if (price === undefined) {
        tooltip.style.visibility = "hidden";
        return;
      }

      const d = new Date((param.time as number) * 1000);

      tooltip.innerHTML = `
        <div style="opacity:0.75; margin-bottom:6px;">
          ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          — ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}
        </div>
        <div style="font-size:15px; font-weight:600;">
          ${Number(price).toLocaleString(undefined, { maximumFractionDigits: 8 })}
        </div>
      `;

      const { x, y } = param.point;
      const w = tooltip.clientWidth;
      const h = tooltip.clientHeight;

      tooltip.style.left = `${Math.min(Math.max(x - w / 2, 0), container.clientWidth - w)}px`;
      tooltip.style.top = `${Math.max(y - h - 14, 8)}px`;
      tooltip.style.visibility = "visible";
    });
  }, [fromCoin, toCoin, range, getNormalizedHistory]);

  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    requestAnimationFrame(() => requestAnimationFrame(build));
  }, [fromCoin, toCoin, range, build]);

  // ------------------------------------------------------------
  // UI (UNCHANGED)
  // ------------------------------------------------------------
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "22px" }}>
      <div style={{ textAlign: "right", marginBottom: "10px" }}>
        <ThemeToggle />
      </div>

      {/* RESULT */}
      {result && fromCoin && toCoin && (
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <div style={{ fontSize: "22px", opacity: 0.65 }}>
            1 {fromCoin.symbol} → {toCoin.symbol}
          </div>
          <div style={{ fontSize: "60px", fontWeight: 700, marginTop: "10px" }}>
            {result.toLocaleString(undefined, { maximumFractionDigits: 8 })} {toCoin.symbol}
          </div>
        </div>
      )}

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
          position: "relative",
          overflow: "visible",
        }}
      />
    </div>
  );
}
