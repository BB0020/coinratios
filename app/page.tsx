"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  createChart,
  type UTCTimestamp,
  type ISeriesApi,
  type LineData,
  type Time,
} from "lightweight-charts";
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
// PAGE
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
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const historyCache = useRef<Record<string, HistoryPoint[]>>({});
  const realtimeCache = useRef<Record<string, number>>({});

  // ------------------------------------------------------------
  // TOOLTIP ELEMENT
  // ------------------------------------------------------------
  function createTooltipElement(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.zIndex = "9999";
    el.style.pointerEvents = "none";
    el.style.visibility = "hidden";
    el.style.padding = "12px 16px";
    el.style.borderRadius = "12px";
    el.style.background = "rgba(255,255,255,0.98)";
    el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)";
    el.style.fontSize = "13px";
    el.style.fontWeight = "500";
    el.style.color = "#111";
    el.style.whiteSpace = "nowrap";
    return el;
  }

  // ------------------------------------------------------------
  // LOAD COINS
  // ------------------------------------------------------------
  useEffect(() => {
    async function loadCoins() {
      const r = await fetch("/api/coins");
      const d = await r.json();
      const final = [USD, ...(d.coins ?? []), ...FIAT_LIST];
      setAllCoins(final);

      const btc = final.find((c) => c.id === "bitcoin");
      setFromCoin(btc || final[1]);
      setToCoin(USD);
    }
    loadCoins();
  }, []);

  // ------------------------------------------------------------
  // RANGE → DAYS
  // ------------------------------------------------------------
  const rangeToDays = (r: string) =>
    r === "24H" ? 1 : r === "7D" ? 7 : r === "1M" ? 30 : r === "3M" ? 90 : r === "6M" ? 180 : 365;

  // ------------------------------------------------------------
  // HISTORY
  // ------------------------------------------------------------
  const getHistory = useCallback(async (base: Coin, quote: Coin, days: number) => {
    const key = `${base.id}-${quote.id}-${days}`;
    if (historyCache.current[key]) return historyCache.current[key];

    const r = await fetch(`/api/history?base=${base.id}&quote=${quote.id}&days=${days}`);
    const d = await r.json();

    const cleaned = (d.history ?? [])
      .filter((p: any) => Number.isFinite(p.value))
      .sort((a: any, b: any) => a.time - b.time);

    historyCache.current[key] = cleaned;
    return cleaned;
  }, []);

  // ------------------------------------------------------------
  // BUILD CHART
  // ------------------------------------------------------------
  const build = useCallback(async () => {
    if (!fromCoin || !toCoin) return;
    const container = chartContainerRef.current;
    if (!container) return;

    const hist = await getHistory(fromCoin, toCoin, rangeToDays(range));
    if (!hist.length) return;

    chartRef.current?.remove();
    chartRef.current = null;
    seriesRef.current = null;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 400,
      layout: { background: { color: "transparent" }, textColor: "#555" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: { mode: 1, vertLine: { width: 1, color: "rgba(0,0,0,0.25)" }, horzLine: { visible: false } },
    });

    chartRef.current = chart;

    const series = chart.addLineSeries({ color: "#3b82f6", lineWidth: 2 });
    series.setData(hist.map((p: HistoryPoint) => ({ time: p.time as UTCTimestamp, value: p.value })));
    seriesRef.current = series;

    chart.timeScale().fitContent();

    if (!tooltipRef.current) {
      tooltipRef.current = createTooltipElement();
      container.appendChild(tooltipRef.current);
    }

    const tooltip = tooltipRef.current;

    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.point || !seriesRef.current) {
        tooltip.style.visibility = "hidden";
        return;
      }

      const data = param.seriesData.get(seriesRef.current) as LineData<Time> | undefined;
      if (!data) {
        tooltip.style.visibility = "hidden";
        return;
      }

      const ts = new Date((param.time as number) * 1000);
      tooltip.innerHTML = `
        <div style="font-size:12px; opacity:.8; margin-bottom:6px;">
          ${ts.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} — 
          ${ts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}
        </div>
        <div style="font-size:15px; font-weight:600;">
          ${data.value.toLocaleString(undefined, { maximumFractionDigits: 8 })}
        </div>
      `;

      const { x, y } = param.point;
      const w = tooltip.clientWidth;
      const h = tooltip.clientHeight;

      tooltip.style.left = `${Math.min(Math.max(x - w / 2, 0), container.clientWidth - w)}px`;
      tooltip.style.top = `${y - h - 12}px`;
      tooltip.style.visibility = "visible";
    });
  }, [fromCoin, toCoin, range, getHistory]);

  useEffect(() => {
    if (fromCoin && toCoin) requestAnimationFrame(build);
  }, [fromCoin, toCoin, range, build]);

  // ------------------------------------------------------------
  // UI (UNCHANGED)
  // ------------------------------------------------------------
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "22px" }}>
      <div style={{ textAlign: "right", marginBottom: "10px" }}>
        <ThemeToggle />
      </div>

      <div ref={chartContainerRef} style={{
        width: "100%",
        height: "400px",
        marginTop: "35px",
        borderRadius: "14px",
        border: "1px solid var(--card-border)",
        background: "var(--card-bg)",
        position: "relative",
        overflow: "visible",
      }} />
    </div>
  );
}