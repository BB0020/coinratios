"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  createChart,
  type UTCTimestamp,
  type ISeriesApi,
  type LineData,
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
  time: number; // seconds
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

  // CHART REFS
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const openBadgeRef = useRef<HTMLDivElement | null>(null);
  const currentBadgeRef = useRef<HTMLDivElement | null>(null);

  const historyCache = useRef<Record<string, HistoryPoint[]>>({});
  const realtimeCache = useRef<Record<string, number>>({});

  // Debug
  useEffect(() => {
    (window as any).chartRef = chartRef;
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
    r === "7D" ? 7 :
    r === "1M" ? 30 :
    r === "3M" ? 90 :
    r === "6M" ? 180 :
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
  // CREATE TOOLTIP ELEMENT
  // ------------------------------------------------------------
  function createTooltipElement() {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.zIndex = "1000";
    el.style.pointerEvents = "none";
    el.style.visibility = "hidden";
    el.style.padding = "12px 16px";
    el.style.borderRadius = "12px";
    el.style.background = "rgba(255,255,255,0.97)";
    el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.15)";
    el.style.fontSize = "13px";
    el.style.fontWeight = "500";
    el.style.color = "#111";
    el.style.whiteSpace = "nowrap";
    el.style.opacity = "0";
    el.style.transition = "opacity .12s ease-out, transform .12s ease-out";
    return el;
  }

  function createBadge(color: string) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.padding = "6px 10px";
    el.style.borderRadius = "6px";
    el.style.fontSize = "14px";
    el.style.fontWeight = "600";
    el.style.color = "#fff";
    el.style.background = color;
    el.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    el.style.pointerEvents = "none";
    el.style.opacity = "0";
    el.style.transition = "opacity .2s ease-out, transform .2s ease-out";
    return el;
  }

  // ------------------------------------------------------------
  // CHART BUILD (ONLY CHART LOGIC REPLACED)
  // ------------------------------------------------------------
  const build = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const container = chartContainerRef.current;
    if (!container) return;

    const days = rangeToDays(range);
    const hist = await getNormalizedHistory(fromCoin, toCoin, days);
    if (!hist.length) return;

    // remove old
    if (chartRef.current) {
      chartRef.current.remove();
      seriesRefs.current.forEach(s => chartRef.current.removeSeries(s));
      seriesRefs.current = [];
    }

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 390,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#e5e7eb" : "#374151",
      },
      grid: { vertLines: { color: "transparent" }, horzLines: { color: "transparent" } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        tickMarkFormatter: (t: UTCTimestamp) => {
          const d = new Date(t * 1000);
          if (range === "24H") {
            return d.toLocaleTimeString(undefined, { hour: "numeric", hour12: true });
          }
          return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        },
      },
      crosshair: { mode: 1 },
    });

    chartRef.current = chart;

    // -----------------------------------------
    // OPEN VALUE & DAShED LINE
    // -----------------------------------------
    const open = hist[0].value;
    const openLine = chart.addLineSeries({
      color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)",
      lineWidth: 1,
      lineStyle: 2,
    });
    openLine.setData(
    hist.map((p: HistoryPoint) => ({
        time: p.time,
        value: open,
    }))
);


    // -----------------------------------------
    // SEGMENTED SERIES (CMC STYLE)
    // -----------------------------------------
    const green = "#16c784";
    const red = "#ea3943";

    function createLine(color: string) {
      const s = chart.addLineSeries({
        color,
        lineWidth: 2,
      });
      seriesRefs.current.push(s);
      return s;
    }

    // Build segments
    let segment: LineData[] = [];
    let currentColor = hist[0].value >= open ? green : red;
    let series = createLine(currentColor);

    for (let i = 0; i < hist.length - 1; i++) {
      const a = hist[i];
      const b = hist[i + 1];
      const aAbove = a.value >= open;
      const bAbove = b.value >= open;

      if (aAbove === bAbove) {
        segment.push({ time: a.time, value: a.value });
      } else {
        // crossing
        const t =
          (open - a.value) / (b.value - a.value);
        const crossTime = a.time + t * (b.time - a.time);

        segment.push({ time: a.time, value: a.value });
        segment.push({ time: crossTime, value: open });

        series.setData(segment);
        segment = [];
        currentColor = currentColor === green ? red : green;
        series = createLine(currentColor);
        segment.push({ time: crossTime, value: open });
      }
    }

    segment.push(hist[hist.length - 1]);
    series.setData(segment);

    chart.timeScale().fitContent();

    // -----------------------------------------
    // BADGES
    // -----------------------------------------
    let openBadge = openBadgeRef.current;
    let currentBadge = currentBadgeRef.current;

    if (!openBadge) {
      openBadge = createBadge("#6b7280");
      openBadgeRef.current = openBadge;
      container.appendChild(openBadge);
    }
    if (!currentBadge) {
      currentBadge = createBadge("#000");
      currentBadgeRef.current = currentBadge;
      container.appendChild(currentBadge);
    }

    // Position + values
    openBadge.textContent = open.toLocaleString(undefined, { maximumFractionDigits: 8 });
    openBadge.style.left = "12px";
    openBadge.style.top = "12px";
    openBadge.style.opacity = "1";

    const last = hist[hist.length - 1].value;
    const isUp = last >= open;
    currentBadge.style.background = isUp ? green : red;
    currentBadge.textContent = last.toLocaleString(undefined, { maximumFractionDigits: 8 });
    currentBadge.style.right = "12px";
    currentBadge.style.top = "12px";
    currentBadge.style.opacity = "1";

    // -----------------------------------------
    // TOOLTIP
    // -----------------------------------------
    let tooltip = tooltipRef.current;
    if (!tooltip) {
      tooltip = createTooltipElement();
      tooltipRef.current = tooltip;
      container.appendChild(tooltip);
    }

    chart.subscribeCrosshairMove(param => {
      const price = param.seriesData?.get(seriesRefs.current[0]);
      if (!param.time || price === undefined || !param.point) {
        tooltip.style.visibility = "hidden";
        tooltip.style.opacity = "0";
        return;
      }

      const ts = new Date(Number(param.time) * 1000);

      const dateStr = ts.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
});

// Fix Safari inserting comma (e.g., "Dec 11, 2025")
const cleanedDate = dateStr.replace(",", "");

const timeStr = ts.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
});

// Format price like CMC (removes scientific notation + auto trims zeros)
const formattedPrice = Number(price).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
});


tooltip.innerHTML = `
  <div style="font-size:12px; opacity:.8; margin-bottom:6px;">
    ${cleanedDate} — ${timeStr}
  </div>
  <div style="font-size:15px; font-weight:600;">
    ${formattedPrice}
  </div>
`;


      const { x, y } = param.point;
      const w = tooltip.clientWidth;
      const h = tooltip.clientHeight;
      tooltip.style.left = `${Math.min(Math.max(x - w / 2, 0), container.clientWidth - w)}px`;
      tooltip.style.top = `${y - h - 16}px`;
      tooltip.style.visibility = "visible";
      tooltip.style.opacity = "1";
    });

    // Resize
    window.addEventListener("resize", () => {
      chart.resize(container.clientWidth, 390);
    });

  }, [fromCoin, toCoin, range, getNormalizedHistory]);

  // Build on load/change
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    const c = chartContainerRef.current;
    if (!c) return;
    requestAnimationFrame(() => requestAnimationFrame(build));
  }, [fromCoin, toCoin, range, build]);

  // ------------------------------------------------------------
  // OPTIONAL THEME LOGIC
  // ------------------------------------------------------------
  useEffect(() => {
    const handler = () => {
      if (!chartRef.current) return;
      const isDark = document.documentElement.classList.contains("dark");
      chartRef.current.applyOptions({
        layout: {
          background: { color: "transparent" },
          textColor: isDark ? "#e5e7eb" : "#374151",
        },
      });
    };
    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  // ------------------------------------------------------------
  // RENDER UI (unchanged)
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

      {renderResult()}

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
