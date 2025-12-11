"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  createChart,
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
    const j = await r.json();

    const cleaned = (j.history ?? [])
      .filter((p: any) => Number.isFinite(p.value))
      .sort((a: any, b: any) => a.time - b.time);

    historyCache.current[key] = cleaned;
    return cleaned;
  }, []);

  // ------------------------------------------------------------
  // ⭐ NORMALIZED HISTORY
  // ------------------------------------------------------------
  const getNormalizedHistory = useCallback(
    async (base: Coin, quote: Coin, days: number) => {
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
    },
    [getHistory]
  );

  // =====================================================================================
  // ⭐ TOOLTIP CREATION (CMC STYLE)
  // =====================================================================================
  function createTooltipElement(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.zIndex = "9999";
    el.style.pointerEvents = "none";
    el.style.visibility = "hidden";
    el.style.padding = "12px 16px";
    el.style.borderRadius = "12px";
    el.style.background = "rgba(255,255,255,0.98)";
    el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.15)";
    el.style.fontSize = "13px";
    el.style.fontWeight = "500";
    el.style.color = "#111";
    el.style.whiteSpace = "nowrap";
    el.style.opacity = "0";
    el.style.transform = "translateY(4px)";
    el.style.transition =
      "opacity 0.12s ease-out, transform 0.12s ease-out, top 0.12s ease-out";
    return el;
  }

  // =====================================================================================
  // ⭐ PRICE BADGE CREATION (CMC STYLE)
  // =====================================================================================
  function createPriceBadge(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "price-badge";
    el.style.position = "absolute";
    el.style.right = "12px";
    el.style.top = "12px";
    el.style.padding = "6px 12px";
    el.style.borderRadius = "8px";
    el.style.fontSize = "14px";
    el.style.fontWeight = "600";
    el.style.pointerEvents = "none";
    el.style.color = "#fff";
    el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition =
      "opacity 0.25s ease-out, transform 0.25s ease-out";
    return el;
  }

  // =====================================================================================
  // ⭐ CHART BUILDER — CMC STYLE (v4-compatible)
  // =====================================================================================
  const latestBuildId = useRef<symbol | null>(null);

  const build = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const buildId = Symbol();
    latestBuildId.current = buildId;

    const container = chartContainerRef.current;
    if (!container) return;

    const days = rangeToDays(range);
    const hist = await getNormalizedHistory(fromCoin, toCoin, days);
    if (!hist.length) return;

    if (latestBuildId.current !== buildId) return;

    // Remove old chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const isDark = document.documentElement.classList.contains("dark");

    // ------------------------------------------------------------
    // Create chart
    // ------------------------------------------------------------
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
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.25, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        tickMarkFormatter: (time: UTCTimestamp) => {
          const d = new Date((time as number) * 1000);
          if (range === "24H") {
            return d.toLocaleTimeString(undefined, {
              hour: "numeric",
              hour12: true,
            });
          }
          return d.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
        },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          style: 2,
          color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.25)",
        },
        horzLine: { visible: false },
      },
    });

    chartRef.current = chart;

    // ------------------------------------------------------------
    // CMC Trend Logic
    // ------------------------------------------------------------
    // Smooth the “open” like CMC does (stabilizes CG data)
      const open =
        hist.length >= 3
          ? (hist[0].value + hist[1].value + hist[2].value) / 3
          : hist[0].value;

    const last = hist[hist.length - 1].value;
    const rising = last > open;

    const lineColor = rising ? "#16c784" : "#ea3943";
    const topColor = rising
      ? "rgba(22,199,132,0.45)"
      : "rgba(234,57,67,0.45)";
    const bottomColor = rising
      ? "rgba(22,199,132,0.05)"
      : "rgba(234,57,67,0.05)";

    // ------------------------------------------------------------
    // Area Series (v4-compliant price formatter)
    // ------------------------------------------------------------
    const series = chart.addAreaSeries({
      lineColor,
      lineWidth: 3,
      topColor,
      bottomColor,
      priceFormat: {
        type: "custom",
        formatter: (p: number) => {
          if (p >= 1_000_000_000) return (p / 1_000_000_000).toFixed(2) + "B";
          if (p >= 1_000_000) return (p / 1_000_000).toFixed(2) + "M";
          if (p >= 1_000) return (p / 1_000).toFixed(2) + "K";
          return p.toFixed(2);
        },
      },
    });

    seriesRef.current = series;

    series.setData(
      hist.map((p: HistoryPoint) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      }))
    );

    chart.timeScale().fitContent();

  
    // ------------------------------------------------------------
    // ⭐ TOOLTIP — v4 Safe Version WITH CORRECT TIMESTAMP RESOLVER
    // ------------------------------------------------------------

    // Timestamp resolver that ALWAYS matches Lightweight-Charts x-axis
    function resolveChartTime(t: any): Date {
      // Case 1: BusinessDay object (used for daily candles)
      if (typeof t === "object" && "year" in t) {
        const d = new Date(t.year, t.month - 1, t.day);
        return new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          d.getHours(),
          d.getMinutes(),
          0
        );
      }

      // Case 2: UNIX timestamp (seconds or ms)
      const raw = Number(t);
      const ms = raw < 2_000_000_000 ? raw * 1000 : raw;

      const d = new Date(ms);

      // Force seconds to zero (no seconds in tooltip)
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        d.getMinutes(),
        0
      );
    }

    let tooltip = tooltipRef.current;
    if (!tooltip) {
      tooltip = createTooltipElement();
      tooltipRef.current = tooltip;
      container.appendChild(tooltip);
    }

    chart.subscribeCrosshairMove((param) => {
      const price = (param as any).seriesPrices?.get(series);

      if (!param.time || !param.point || price === undefined) {
        tooltip.style.visibility = "hidden";
        tooltip.style.opacity = "0";
        return;
      }

      // Convert timestamp EXACTLY like the x-axis does
      const ts = resolveChartTime(param.time);

      const dateStr = ts.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "2-digit",
      });

      const timeStr = ts.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      tooltip.innerHTML = `
        <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">
          ${dateStr} — ${timeStr}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="
            width:10px;
            height:10px;
            border-radius:50%;
            background:${lineColor};
          "></div>
          <div style="font-size:15px; font-weight:600;">
            ${price.toLocaleString(undefined, { maximumFractionDigits: 8 })}
          </div>
        </div>
      `;

      const { x, y } = param.point;
      const w = tooltip.clientWidth;
      const h = tooltip.clientHeight;

      const left = Math.min(Math.max(x - w / 2, 0), container.clientWidth - w);
      const top = y - h - 16;

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.visibility = "visible";

      requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
        tooltip.style.transform = "translateY(0px)";
      });
    });



    // ------------------------------------------------------------
    // Resize handler
    // ------------------------------------------------------------
    const handleResize = () => {
      if (!chartRef.current) return;
      chartRef.current.resize(container.clientWidth, 390);
    };

    window.addEventListener("resize", handleResize);
  }, [fromCoin, toCoin, range, getNormalizedHistory]);

  // ------------------------------------------------------------
  // BUILD ON LOAD / CHANGE
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
  // THEME UPDATE HANDLER
  // ------------------------------------------------------------
  useEffect(() => {
    const handler = () => {
      if (!chartRef.current || !seriesRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");

      chartRef.current.applyOptions({
        layout: {
          background: { color: "transparent" },
          textColor: isDark ? "#e5e7eb" : "#374151",
        },
        grid: {
          vertLines: { color: "transparent" },
          horzLines: { color: "transparent" },
        },
      });

      seriesRef.current.applyOptions({
        lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      });
    };

    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  // ------------------------------------------------------------
  // DROPDOWN ROW
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

  // ------------------------------------------------------------
  // DROPDOWN PANEL
  // ------------------------------------------------------------
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
  // RANGE BUTTONS (CMC STYLE)
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
          {(1 / baseRate).toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
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

      {/* TOP ROW: Amount / From / Swap / To */}
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
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
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

        {/* SWAP */}
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
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
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
        }}
      />
    </div>
  );
}
