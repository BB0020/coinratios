"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  createChart,
  ColorType,
  type UTCTimestamp,
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
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const historyCache = useRef<Record<string, HistoryPoint[]>>({});
  const realtimeCache = useRef<Record<string, number>>({});

  // Debug exposure
  useEffect(() => {
    (window as any).chartRef = chartRef;
    (window as any).seriesRef = seriesRef;
  }, []);

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
  // RAW HISTORY (CACHED)
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
  // ⭐ NORMALIZED HISTORY (ALWAYS HOURLY, ALWAYS CORRECT DIRECTION)
  // ------------------------------------------------------------
  const getNormalizedHistory = useCallback(
    async (base: Coin, quote: Coin, days: number) => {
      let forwardBase = base;
      let forwardQuote = quote;
      let invert = false;

      // If fiat is base, invert manually
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
    },
    [getHistory]
  );
// ------------------------------------------------------------
// ⭐ CMC-STYLE CHART BUILDER
// ------------------------------------------------------------
const latestBuildId = useRef<symbol | null>(null);

const build = useCallback(async () => {
  if (!fromCoin || !toCoin) return;

  const buildId = Symbol();
  latestBuildId.current = buildId;

  const container = chartContainerRef.current;
  if (!container) return;

  const days = rangeToDays(range);
  const hist = await getNormalizedHistory(fromCoin, toCoin, days);

  if (latestBuildId.current !== buildId) return;

  // Remove previous chart
  if (chartRef.current) {
    chartRef.current.remove();
    chartRef.current = null;
    seriesRef.current = null;
  }

  const isDark = document.documentElement.classList.contains("dark");

  // ------------------------------------------
  // CREATE MAIN CHART
  // ------------------------------------------
  const chart = createChart(container, {
    width: container.clientWidth,
    height: 390,
    layout: {
      background: { color: "transparent" },
      textColor: isDark ? "#e5e7eb" : "#374151",
    },
    grid: {
      vertLines: { color: "transparent" },
      horzLines: { color: "transparent" },
    },
    crosshair: {
      mode: 1,
      vertLine: {
        width: 1,
        color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
        style: 2,
        labelVisible: false,
      },
      horzLine: { visible: false },
    },
    rightPriceScale: {
      borderVisible: false,
      scaleMargins: {
        top: 0.25,
        bottom: 0.1,
      },
    },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // ------------------------------------------
  // DETERMINE CHART COLOR TREND
  // ------------------------------------------
  const first = hist[0]?.value ?? 0;
  const last = hist[hist.length - 1]?.value ?? 0;
  const rising = last >= first;

  const lineColor = rising ? "#16c784" : "#ea3943";
  const topColor = rising
    ? "rgba(22,199,132,0.45)"
    : "rgba(234,57,67,0.45)";
  const bottomColor = rising
    ? "rgba(22,199,132,0.05)"
    : "rgba(234,57,67,0.05)";

  // ------------------------------------------
  // MAIN AREA SERIES (SMOOTH CURVE)
  // ------------------------------------------
  const series = chart.addAreaSeries({
    lineColor,
    lineWidth: 3,
    topColor,
    bottomColor,
    priceFormat: {
      type: "price",
      precision: 6,
      minMove: 0.000001,
    },
  });

  chartRef.current = chart;
  seriesRef.current = series;

  // Set data
  if (hist.length > 0) {
    series.setData(
      hist.map((p: HistoryPoint) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      }))
    );
    chart.timeScale().fitContent();
  }

  // ------------------------------------------
  // RESIZE HANDLER
  // ------------------------------------------
  const handleResize = () => {
    if (!chartRef.current) return;
    chartRef.current.resize(container.clientWidth, 390);
  };
  window.addEventListener("resize", handleResize);

}, [fromCoin, toCoin, range, getNormalizedHistory]);

// ------------------------------------------------------------
// CHART EFFECT — ENSURES FIRST RENDER IS CORRECT
// ------------------------------------------------------------
useEffect(() => {
  if (!fromCoin || !toCoin) return;
  const container = chartContainerRef.current;
  if (!container) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      build();
    });
  });
}, [fromCoin, toCoin, range, build]);
// ------------------------------------------------------------
// ⭐ TOOLTIP CREATION (CMC STYLE)
// ------------------------------------------------------------
function createTooltipElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.zIndex = "1000";
  el.style.pointerEvents = "none";
  el.style.visibility = "hidden";
  el.style.padding = "10px 14px";
  el.style.borderRadius = "10px";
  el.style.background = "#ffffff";
  el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.15)";
  el.style.fontSize = "13px";
  el.style.fontWeight = "500";
  el.style.color = "#111";
  el.style.transition = "transform 0.08s ease-out";
  return el;
}

useEffect(() => {
  const container = chartContainerRef.current;
  if (!container) return;

  // Create tooltip once
  if (!tooltipRef.current) {
    tooltipRef.current = createTooltipElement();
    container.appendChild(tooltipRef.current);
  }

  const tooltip = tooltipRef.current;

  if (!chartRef.current || !tooltip) return;

  const chart = chartRef.current;
  const series = seriesRef.current;

  // ------------------------------------------------------------
  // ⭐ CROSSHAIR MOVE HANDLER
  // ------------------------------------------------------------
  const handleMove = (param: any) => {
    if (!param.time || !param.point) {
      tooltip.style.visibility = "hidden";
      return;
    }

    const price = param.seriesPrices.get(series);
    if (price === undefined) {
      tooltip.style.visibility = "hidden";
      return;
    }

    const x = param.point.x;
    const y = param.point.y;

    // ------------------------------------------
    // FORMAT DATE + TIME IN USER LOCAL TIME
    // ------------------------------------------
    const ts = (param.time as number) * 1000;
    const d = new Date(ts);

    const dateStr = d.toLocaleDateString(undefined, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });

    const timeStr = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    // -------------------------------------------------------
    // DETERMINE TREND COLOR FOR DOT
    // -------------------------------------------------------
    const lineColor =
      series.options().lineColor ?? "#16c784";

    // -------------------------------------------------------
    // BUILD TOOLTIP HTML
    // -------------------------------------------------------
    tooltip.innerHTML = `
      <div style="font-size:12px; opacity:0.85; margin-bottom:6px;">
        ${dateStr} — ${timeStr}
      </div>

      <div style="display:flex; align-items:center; gap:6px;">
        <div style="
          width:8px;
          height:8px;
          border-radius:50%;
          background:${lineColor};
        "></div>

        <div style="font-size:15px; font-weight:600;">
          ${price.toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}
        </div>
      </div>
    `;

    // ------------------------------------------
    // POSITION ABOVE CURSOR
    // ------------------------------------------
    const tooltipWidth = tooltip.clientWidth;
    const tooltipHeight = tooltip.clientHeight;

    const left = Math.min(
      Math.max(x - tooltipWidth / 2, 0),
      container.clientWidth - tooltipWidth
    );

    const top = y - tooltipHeight - 14; // 14px gap above cursor

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = "visible";
  };

  // Attach listener
  chart.subscribeCrosshairMove(handleMove);

  // Cleanup
  return () => {
    chart.unsubscribeCrosshairMove(handleMove);
  };
}, [fromCoin, toCoin, range]);
// ------------------------------------------------------------
// DROPDOWN HELPERS
// ------------------------------------------------------------
const renderRow = useCallback(
  (coin: Coin, type: "from" | "to") => {
    const disabled =
      (type === "from" && coin.id === toCoin?.id) ||
      (type === "to" && coin.id === fromCoin?.id);

    const selected =
      (type === "from" && coin.id === fromCoin?.id) ||
      (type === "to" && coin.id === toCoin?.id);

    let cls = "dropdown-row";
    if (selected) cls += " dropdown-selected";
    if (disabled) cls += " dropdown-disabled";

    return (
      <div
        key={coin.id}
        className={cls}
        onClick={() => {
          if (disabled) return;
          type === "from" ? setFromCoin(coin) : setToCoin(coin);
          setOpenDropdown(null);
          setFromSearch("");
          setToSearch("");
        }}
      >
        <img src={coin.image} className="dropdown-flag" />
        <div>
          <div className="dropdown-symbol">{coin.symbol}</div>
          <div className="dropdown-name">{coin.name}</div>
        </div>
      </div>
    );
  },
  [fromCoin, toCoin]
);

const renderDropdown = useCallback(
  (type: "from" | "to") => {
    const search = type === "from" ? fromSearch : toSearch;
    const setSearch = type === "from" ? setFromSearch : setToSearch;

    return (
      <div className="dropdown-panel">
        <input
          className="dropdown-search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filteredCoins(search).map((c) => renderRow(c, type))}
      </div>
    );
  },
  [filteredCoins, fromSearch, toSearch, renderRow]
);

// ------------------------------------------------------------
// RANGE BUTTONS
// ------------------------------------------------------------
const RangeButtons = () => {
  const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y"];

  return (
    <div style={{ textAlign: "center", marginTop: "35px" }}>
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          style={{
            margin: "0 4px",
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid var(--card-border)",
            background: range === r ? "var(--accent)" : "var(--card-bg)",
            color: range === r ? "#fff" : "var(--text)",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
};

// ------------------------------------------------------------
// RESULT DISPLAY
// ------------------------------------------------------------
const renderResult = () => {
  if (!result || !fromCoin || !toCoin) return null;

  const baseRate = result / Number(amount);

  return (
    <div style={{ textAlign: "center", marginTop: "40px" }}>
      <div style={{ fontSize: "22px", opacity: 0.65 }}>
        1 {fromCoin.symbol} → {toCoin.symbol}
      </div>

      <div style={{ fontSize: "60px", fontWeight: 700, marginTop: "10px" }}>
        {result.toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
        {toCoin.symbol}
      </div>

      <div style={{ marginTop: "10px", opacity: 0.7 }}>
        1 {fromCoin.symbol} ={" "}
        {baseRate.toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
        {toCoin.symbol}
        <br />
        1 {toCoin.symbol} ={" "}
        {(1 / baseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
        {fromCoin.symbol}
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// MAIN UI
// ------------------------------------------------------------
return (
  <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "22px" }}>
    <div style={{ textAlign: "right", marginBottom: "10px" }}>
      <ThemeToggle />
    </div>

    {/* TOP ROW */}
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: "32px",
        flexWrap: "wrap",
        marginTop: "10px",
      }}
    >
      {/* AMOUNT */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <h3>AMOUNT</h3>
        <input
          value={amount}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setAmount(v);
          }}
          className="selector-box"
          style={{ width: "260px" }}
        />
        {(amount === "" || Number(amount) <= 0) && (
          <div style={{ color: "red", marginTop: "6px", fontSize: "14px" }}>
            Enter a Number Greater than 0
          </div>
        )}
      </div>

      {/* FROM */}
      <div
        style={{ display: "flex", flexDirection: "column", position: "relative" }}
      >
        <h3>FROM</h3>
        <div
          className="selector-box"
          onClick={() => {
            setOpenDropdown(openDropdown === "from" ? null : "from");
            setFromSearch("");
          }}
        >
          {fromCoin && (
            <>
              <img src={fromCoin.image} className="selector-img" />
              <div>
                <div className="selector-symbol">{fromCoin.symbol}</div>
                <div className="selector-name">{fromCoin.name}</div>
              </div>
            </>
          )}
        </div>
        {openDropdown === "from" && renderDropdown("from")}
      </div>

      {/* SWAP BUTTON */}
      <div
        className="swap-circle"
        style={{ marginTop: "38px" }}
        onClick={() => {
          if (fromCoin && toCoin) {
            const f = fromCoin;
            setFromCoin(toCoin);
            setToCoin(f);
          }
        }}
      >
        <div className="swap-icon" />
      </div>

      {/* TO */}
      <div
        style={{ display: "flex", flexDirection: "column", position: "relative" }}
      >
        <h3>TO</h3>
        <div
          className="selector-box"
          onClick={() => {
            setOpenDropdown(openDropdown === "to" ? null : "to");
            setToSearch("");
          }}
        >
          {toCoin && (
            <>
              <img src={toCoin.image} className="selector-img" />
              <div>
                <div className="selector-symbol">{toCoin.symbol}</div>
                <div className="selector-name">{toCoin.name}</div>
              </div>
            </>
          )}
        </div>
        {openDropdown === "to" && renderDropdown("to")}
      </div>
    </div>

    {/* RESULT */}
    {renderResult()}

    {/* RANGE BUTTONS */}
    <RangeButtons />

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
// ------------------------------------------------------------
// END OF PAGE COMPONENT
// ------------------------------------------------------------
}
