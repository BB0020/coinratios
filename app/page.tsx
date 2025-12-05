"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart, type UTCTimestamp, type AreaData } from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

/* -------------------------------------------------------------
   TYPES
------------------------------------------------------------- */
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

interface HistoryPoint {
  time: number;  // Later cast to UTCTimestamp
  value: number;
}

/* -------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------- */
const USD: Coin = {
  id: "USD",
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

/* -------------------------------------------------------------
   PAGE COMPONENT
------------------------------------------------------------- */
export default function Page() {
  /* ------------------------------ STATE ------------------------------ */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);

  const [range, setRange] = useState("24H");

  /* ------------------------------ REFS ------------------------------ */
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const lastHistory = useRef<HistoryPoint[]>([]);
  const historyCache = useRef<Record<string, HistoryPoint[]>>({});
  const realtimeCache = useRef<Record<string, number>>({});

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------------------------------------------
     LOAD COINS FROM SERVER ROUTE
  ------------------------------------------------------------- */
  useEffect(() => {
    async function loadCoins() {
      const r = await fetch("/api/coins");
      const d = await r.json();

      const crypto = d.coins ?? [];
      const final = [USD, ...crypto, ...FIAT_LIST];

      setAllCoins(final);

      const btc = final.find((c) => c.id === "bitcoin");
      setFromCoin(btc || final[1]);
      setToCoin(USD);
    }

    loadCoins();
  }, []);

  /* -------------------------------------------------------------
     CLICK OUTSIDE TO CLOSE DROPDOWNS
  ------------------------------------------------------------- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openDropdown === "from" && fromPanelRef.current && !fromPanelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setFromSearch("");
      }
      if (openDropdown === "to" && toPanelRef.current && !toPanelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setToSearch("");
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  /* -------------------------------------------------------------
     FILTERED COINS
  ------------------------------------------------------------- */
  const filteredCoins = useCallback(
    (q: string) => {
      if (!q) return allCoins;
      const s = q.toLowerCase();
      return allCoins.filter(
        (c) => c.symbol.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)
      );
    },
    [allCoins]
  );

  /* -------------------------------------------------------------
     REALTIME PRICE (BATCHED)
  ------------------------------------------------------------- */
  const getRealtime = useCallback(async (coin: Coin): Promise<number> => {
    const key = coin.id;
    if (realtimeCache.current[key]) return realtimeCache.current[key];

    const url =
      coin.type === "crypto"
        ? `/api/price?ids=${coin.id}`
        : `/api/price?fiats=${coin.symbol}`;

    const r = await fetch(url);
    const d = await r.json();

    let price = 1;

    if (coin.type === "crypto") price = d.crypto?.[coin.id]?.usd ?? 0;
    else price = d.fiat?.[coin.symbol] ?? 0;

    realtimeCache.current[key] = price;
    return price;
  }, []);

  /* -------------------------------------------------------------
     CONVERSION RESULT
  ------------------------------------------------------------- */
  const computeResult = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) return setResult(null);

    const [a, b] = await Promise.all([getRealtime(fromCoin), getRealtime(toCoin)]);

    setResult((a / b) * amt);
  }, [amount, fromCoin, toCoin, getRealtime]);

  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    const t = setTimeout(computeResult, 180);
    return () => clearTimeout(t);
  }, [fromCoin, toCoin, amount, computeResult]);

  /* -------------------------------------------------------------
     RANGE → DAYS
  ------------------------------------------------------------- */
  const rangeToDays = (r: string) =>
    r === "24H" ? 1 :
    r === "7D" ? 7 :
    r === "1M" ? 30 :
    r === "3M" ? 90 :
    r === "6M" ? 180 : 365;

  /* -------------------------------------------------------------
     HISTORY (SERVER ROUTE + CACHE)
  ------------------------------------------------------------- */
  const getHistory = useCallback(
    async (base: Coin, quote: Coin, days: number): Promise<HistoryPoint[]> => {
      const key = `${base.id}-${quote.id}-${days}`;
      if (historyCache.current[key]) return historyCache.current[key];

      const r = await fetch(`/api/history?base=${base.id}&quote=${quote.id}&days=${days}`);
      const d = await r.json();

      const arr = (d.history ?? []) as HistoryPoint[];
      historyCache.current[key] = arr;
      return arr;
    },
    []
  );

  /* -------------------------------------------------------------
     UPDATE CHART
  ------------------------------------------------------------- */
  const updateChart = useCallback(async () => {
    if (!fromCoin || !toCoin || !seriesRef.current) return;

    const days = rangeToDays(range);
    const hist = await getHistory(fromCoin, toCoin, days);

    if (!hist.length) return;

    lastHistory.current = hist;

    const formatted: AreaData[] = hist.map((p) => ({
      time: p.time as UTCTimestamp,
      value: p.value,
    }));

    seriesRef.current.setData(formatted);
    chartRef.current?.timeScale().fitContent();
  }, [fromCoin, toCoin, range, getHistory]);

  /* -------------------------------------------------------------
     INIT CHART AFTER FIRST HISTORY LOADS
  ------------------------------------------------------------- */
  useEffect(() => {
    async function init() {
      if (!chartContainerRef.current || chartRef.current) return;
      if (!fromCoin || !toCoin) return;

      const days = rangeToDays(range);
      const hist = await getHistory(fromCoin, toCoin, days);

      const container = chartContainerRef.current;
      const isDark = document.documentElement.classList.contains("dark");

      const chart = createChart(container, {
        width: container.clientWidth,
        height: 390,
        layout: {
          background: { color: isDark ? "#111" : "#fff" },
          textColor: isDark ? "#eee" : "#1a1a1a",
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

      chartRef.current = chart;
      seriesRef.current = series;

      if (hist.length) {
        lastHistory.current = hist;
        const formatted: AreaData[] = hist.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
        }));
        series.setData(formatted);
        chart.timeScale().fitContent();
      }

      const resizeFn = () => chart.resize(container.clientWidth, 390);
      window.addEventListener("resize", resizeFn);

      return () => {
        window.removeEventListener("resize", resizeFn);
        chart.remove();
      };
    }

    init();
  }, [fromCoin, toCoin]);

  /* -------------------------------------------------------------
     REFRESH CHART ON RANGE CHANGE
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!chartRef.current) return;
    updateChart();
  }, [updateChart]);

  /* -------------------------------------------------------------
     THEME SYNC
  ------------------------------------------------------------- */
  useEffect(() => {
    const handler = () => {
      if (!chartRef.current || !seriesRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");

      chartRef.current.applyOptions({
        layout: {
          background: { color: isDark ? "#111" : "#fff" },
          textColor: isDark ? "#eee" : "#1a1a1a",
        },
      });

      seriesRef.current.applyOptions({
        lineColor: isDark ? "#4ea1f7" : "#3b82f6",
        topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
      });
    };

    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  /* -------------------------------------------------------------
     DROPDOWNS
  ------------------------------------------------------------- */
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
            if (!disabled) {
              type === "from" ? setFromCoin(coin) : setToCoin(coin);
              setOpenDropdown(null);
              setFromSearch("");
              setToSearch("");
            }
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
      const set = type === "from" ? setFromSearch : setToSearch;
      const ref = type === "from" ? fromPanelRef : toPanelRef;

      return (
        <div className="dropdown-panel" ref={ref}>
          <input
            className="dropdown-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => set(e.target.value)}
          />
          {filteredCoins(search).map((c) => renderRow(c, type))}
        </div>
      );
    },
    [filteredCoins, fromSearch, toSearch, renderRow]
  );

  /* -------------------------------------------------------------
     RENDER RESULT
  ------------------------------------------------------------- */
  const renderResult = () => {
    if (!result || !fromCoin || !toCoin) return null;

    const base = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "40px" }}>
        <div style={{ fontSize: "22px", opacity: 0.65 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>
        <div style={{ fontSize: "60px", fontWeight: 700, marginTop: "10px" }}>
          {result.toLocaleString(undefined, { maximumFractionDigits: 8 })} {toCoin.symbol}
        </div>
        <div style={{ marginTop: "10px", opacity: 0.7 }}>
          1 {fromCoin.symbol} = {base.toFixed(8)} {toCoin.symbol}
          <br />
          1 {toCoin.symbol} = {(1 / base).toFixed(8)} {fromCoin.symbol}
        </div>
      </div>
    );
  };

  /* -------------------------------------------------------------
     RANGE BUTTONS
  ------------------------------------------------------------- */
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
            }}
          >
            {r}
          </button>
        ))}
      </div>
    );
  };

  /* -------------------------------------------------------------
     MAIN RENDER
  ------------------------------------------------------------- */
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
            placeholder="0.00"
            inputMode="decimal"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setAmount(v);
            }}
            className="selector-box"
            style={{ width: "260px" }}
          />
          {(amount === "" || Number(amount) <= 0) && (
            <div style={{ color: "red", marginTop: "6px" }}>Enter a Number Greater than 0</div>
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

        {/* SWAP BUTTON */}
        <div
          onClick={() => fromCoin && toCoin && (setFromCoin(toCoin), setToCoin(fromCoin))}
          className="swap-circle"
          style={{ marginTop: "38px" }}
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

      {/* RANGES */}
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
        }}
      />
    </div>
  );
}
