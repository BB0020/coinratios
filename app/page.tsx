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
// PAGE COMPONENT START
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

  const segmentSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);
  const openLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);

  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const historyCache = useRef<Record<string, HistoryPoint[]>>({});
  const realtimeCache = useRef<Record<string, number>>({});
  // Debug exposure
  useEffect(() => {
    (window as any).chartRef = chartRef;
    (window as any).segments = segmentSeriesRefs;
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
  // FETCH RAW HISTORY (CACHED)
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
  // NORMALIZED HISTORY (handles fiat inversion)
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
  // ------------------------------------------------------------
  // SEGMENTED RED/GREEN CHART BUILDER (CMC STYLE)
  // ------------------------------------------------------------
  const buildChart = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const container = chartContainerRef.current;
    if (!container) return;

    // Load history
    const days = rangeToDays(range);
    const hist = await getNormalizedHistory(fromCoin, toCoin, days);
    if (!hist.length) return;

    // Remove old
    if (chartRef.current) {
      chartRef.current.remove();
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
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.25, bottom: 0.1 } },
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
        vertLine: { width: 1, style: 2, color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)" },
        horzLine: { visible: false },
      },
    });

    chartRef.current = chart;

    // ----------------------------------------
    // Compute open price
    // ----------------------------------------
    const open =
      hist.length >= 3
        ? (hist[0].value + hist[1].value + hist[2].value) / 3
        : hist[0].value;

    // ----------------------------------------
    // Neutral Area (behind segments)
    // ----------------------------------------
    const area = chart.addAreaSeries({
      topColor: "rgba(120,120,120,0.05)",
      bottomColor: "rgba(120,120,120,0.00)",
      lineColor: "rgba(0,0,0,0)",
      });

    area.setData(hist.map((p: HistoryPoint) => ({
      time: p.time,
      value: p.value,
    })));

    areaRef.current = area;

    // ----------------------------------------
    // Dashed Open Price Line
    // ----------------------------------------
    const openLine = chart.addLineSeries({
      color: "#999",
      lineWidth: 1,
      lineStyle: 2,
    });

    openLine.setData(hist.map((p: HistoryPoint) => ({
      time: p.time,
      value: open,
    })));

    openLineRef.current = openLine;

    // ----------------------------------------
    // Segment the history into green/red intervals
    // ----------------------------------------
    segmentSeriesRefs.current = [];

    let currentColor: "red" | "green" =
      hist[0].value >= open ? "green" : "red";

    let buffer: LineData[] = [];

    const pushSegment = () => {
      if (!buffer.length) return;

      const series = chart.addLineSeries({
        color: currentColor === "green" ? "#16c784" : "#ea3943",
        lineWidth: 3,
      });

      series.setData(buffer);
      segmentSeriesRefs.current.push(series);
      buffer = [];
    };

    for (let i = 0; i < hist.length; i++) {
      const p = hist[i];
      const above = p.value >= open;
      const color = above ? "green" : "red";

      if (color !== currentColor) {
        pushSegment();
        currentColor = color;
      }

      buffer.push({ time: p.time, value: p.value });
    }

    pushSegment();

    chart.timeScale().fitContent();
    // ------------------------------------------------------------
    // TOOLTIP
    // ------------------------------------------------------------
    let tooltip = tooltipRef.current;
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltipRef.current = tooltip;
      tooltip.style.position = "absolute";
      tooltip.style.pointerEvents = "none";
      tooltip.style.visibility = "hidden";
      tooltip.style.background = "rgba(255,255,255,0.98)";
      tooltip.style.padding = "10px 14px";
      tooltip.style.borderRadius = "8px";
      tooltip.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)";
      tooltip.style.fontSize = "13px";
      tooltip.style.transition =
        "opacity 0.12s ease, transform 0.12s ease";
      container.appendChild(tooltip);
    }

    // ----------------------------------------
    // OPEN PRICE BADGE (LEFT)
    // ----------------------------------------
    const badge = document.createElement("div");
    badge.style.position = "absolute";
    badge.style.left = "12px";
    badge.style.top = "12px";
    badge.style.padding = "6px 10px";
    badge.style.borderRadius = "8px";
    badge.style.color = "#fff";
    badge.style.fontWeight = "600";
    badge.style.background = "#444";
    badge.style.fontSize = "14px";
    badge.innerText =
      open >= 1000 ? (open / 1000).toFixed(2) + "K" : open.toFixed(2);

    container.appendChild(badge);

    // ------------------------------------------------------------
    // HOVER LOGIC
    // ------------------------------------------------------------
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) {
        tooltip!.style.visibility = "hidden";
        return;
      }

      // Correct timestamp handling
      let ts: Date;
      if (typeof param.time === "object" && "year" in param.time) {
        const t = param.time as any;
        ts = new Date(t.year, t.month - 1, t.day);
      } else {
        const raw = Number(param.time);
        const ms = raw < 2_000_000_000 ? raw * 1000 : raw;
        ts = new Date(ms);
      }

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

      // Determine hover color (match the segment)
      let hoverColor = "#16c784";
      for (const s of segmentSeriesRefs.current) {
        const opt = s.options();
        hoverColor = opt.color as string;
      }

      // Extract price
      const price = (param as any).seriesPrices?.get(
        segmentSeriesRefs.current[0]
      );

      tooltip!.innerHTML = `
        <div style="font-size:12px; opacity:0.75;">${dateStr} — ${timeStr}</div>
        <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
          <div style="
            width:10px; height:10px;
            background:${hoverColor};
            border-radius:50%;
          "></div>
          <div style="font-size:15px; font-weight:600;">
            ${price?.toLocaleString(undefined, { maximumFractionDigits: 8 })}
          </div>
        </div>
      `;

      const { x, y } = param.point;
      const w = tooltip!.clientWidth;
      const h = tooltip!.clientHeight;
      tooltip!.style.left = `${Math.min(Math.max(x - w / 2, 0), container.clientWidth - w)}px`;
      tooltip!.style.top = `${y - h - 16}px`;
      tooltip!.style.visibility = "visible";
    });

    // Resize
    window.addEventListener("resize", () => {
      chart.resize(container.clientWidth, 390);
    });
  }, [fromCoin, toCoin, range, getNormalizedHistory]);
  // Rebuild chart when inputs change
  useEffect(() => {
    const c = chartContainerRef.current;
    if (!c) return;
    requestAnimationFrame(() => buildChart());
  }, [buildChart, fromCoin, toCoin, range]);

  // ------------------------------------------------------------
  // DROPDOWN ITEM
  // ------------------------------------------------------------
  const renderRow = useCallback(
    (coin: Coin, type: "from" | "to") => {
      const disabled =
        (type === "from" && coin.id === toCoin?.id) ||
        (type === "to" && coin.id === fromCoin?.id);

      const selected =
        (type === "from" && coin.id === fromCoin?.id) ||
        (type === "to" && coin.id === toCoin?.id);

      return (
        <div
          key={coin.id}
          className={`dropdown-row${selected ? " dropdown-selected" : ""}${disabled ? " dropdown-disabled" : ""}`}
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
