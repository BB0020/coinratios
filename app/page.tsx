"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat" | "usd";
}

interface PricePoint {
  time: number;
  value: number;
}

const RANGES = ["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"];

const RANGE_DAYS: Record<string, number> = {
  "24H": 1,
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "ALL": 0,      // 0 means ALL (full history)
};

// Simple debounce
function debounce(fn: Function, delay: number) {
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
export default function Page() {
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);
  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);
  const [range, setRange] = useState("24H");

  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const priceCache = useRef<Record<string, number>>({});
  const historyCache = useRef<Record<string, PricePoint[]>>({});
  const lastValidData = useRef<PricePoint[]>([]);

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------------------
     LOAD COINS + DEFAULT BTC→USD
  ------------------------------------------------------ */
  useEffect(() => {
    async function init() {
      const res = await fetch("/api/coins");
      const data = await res.json();

      const cryptos: Coin[] = data.cryptos;

      // Full fiat list (same UI)
      const fiats: Coin[] = [
        { id: "usd", symbol: "USD", name: "US Dollar", image: "https://flagcdn.com/us.svg", type: "usd" },
        { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
        { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
        { id: "gbp", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
        { id: "jpy", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
      ];

      const finalList = [...cryptos];

      for (const f of fiats) {
        const idx = finalList.findIndex(c => f.symbol.localeCompare(c.symbol) < 0);
        if (idx === -1) finalList.push(f);
        else finalList.splice(idx, 0, f);
      }

      setAllCoins(finalList);

      const btc = finalList.find(c => c.id === "bitcoin");
      const usd = finalList.find(c => c.symbol === "USD");

      setFromCoin(btc || finalList[0]);
      setToCoin(usd!);

      // Preload main ranges for BTC → USD
      if (btc && usd) preloadPair(btc, usd);
    }

    init();
  }, []);
  /* ------------------------------------------------------
     PRICE FETCH + LOCAL CACHE
  ------------------------------------------------------ */
  const fetchPriceUSD = useCallback(async (coin: Coin) => {
    const key = `price-${coin.id}`;

    if (priceCache.current[key]) return priceCache.current[key];

    const ls = localStorage.getItem(key);
    if (ls) {
      const obj = JSON.parse(ls);
      if (Date.now() - obj.ts < 60000) {
        priceCache.current[key] = obj.value;
        return obj.value;
      }
    }

    const params = new URLSearchParams({
      id: coin.id,
      type: coin.type,
      symbol: coin.symbol
    });

    const res = await fetch(`/api/price?${params}`);
    const data = await res.json();

    priceCache.current[key] = data.value;
    localStorage.setItem(key, JSON.stringify({ value: data.value, ts: Date.now() }));

    return data.value;
  }, []);

  /* ------------------------------------------------------
     HISTORY FETCH + LOCAL CACHE
  ------------------------------------------------------ */
  const fetchHistory = useCallback(async (coin: Coin, days: number) => {
    const key = `hist-${coin.id}-${days}`;

    if (historyCache.current[key]) return historyCache.current[key];

    const ls = localStorage.getItem(key);
    if (ls) {
      const arr = JSON.parse(ls);
      historyCache.current[key] = arr;
      return arr;
    }

    const params = new URLSearchParams({
      id: coin.id,
      type: coin.type,
      symbol: coin.symbol,
      days: String(days)
    });

    const res = await fetch(`/api/history?${params}`);
    const arr = await res.json();

    historyCache.current[key] = arr;
    localStorage.setItem(key, JSON.stringify(arr));

    return arr;
  }, []);

  /* ------------------------------------------------------
     MERGE USING NEAREST TIMESTAMPS
  ------------------------------------------------------ */
  const mergeNearest = useCallback((a: PricePoint[], b: PricePoint[]) => {
    const out: PricePoint[] = [];
    let j = 0;

    for (let i = 0; i < a.length; i++) {
      while (
        j < b.length - 1 &&
        Math.abs(b[j + 1].time - a[i].time) < Math.abs(b[j].time - a[i].time)
      ) {
        j++;
      }
      out.push({
        time: a[i].time,
        value: a[i].value / b[j].value
      });
    }

    return out;
  }, []);
  /* ------------------------------------------------------
     REALTIME CONVERSION
  ------------------------------------------------------ */
  const computeResult = useCallback(async () => {
    if (!fromCoin || !toCoin) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setResult(null);
      return;
    }

    const [fromUSD, toUSD] = await Promise.all([
      fetchPriceUSD(fromCoin),
      fetchPriceUSD(toCoin)
    ]);

    const rate = fromUSD / toUSD;
    setResult(rate * amt);
  }, [amount, fromCoin, toCoin, fetchPriceUSD]);

  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    const t = setTimeout(computeResult, 180);
    return () => clearTimeout(t);
  }, [amount, fromCoin, toCoin, computeResult]);

  /* ------------------------------------------------------
     AUTO PRELOAD (24H→1Y only)
  ------------------------------------------------------ */
  const doPreload = async (from: Coin, to: Coin) => {
    for (const r of RANGES) {
      if (r === "ALL") continue; // load ALL only on click
      const days = RANGE_DAYS[r];
      const [a, b] = await Promise.all([
        fetchHistory(from, days),
        fetchHistory(to, days)
      ]);
      const merged = mergeNearest(a, b);
      localStorage.setItem(`pair-${from.id}-${to.id}-${days}`, JSON.stringify(merged));
    }
  };

  const preloadPairDebounced = useRef(
    debounce((from: Coin, to: Coin) => doPreload(from, to), 400)
  ).current;

  const preloadPair = useCallback((from: Coin, to: Coin) => {
    preloadPairDebounced(from, to);
  }, [preloadPairDebounced]);

  useEffect(() => {
    if (fromCoin && toCoin) preloadPair(fromCoin, toCoin);
  }, [fromCoin, toCoin, preloadPair]);

  /* ------------------------------------------------------
     INIT CHART
  ------------------------------------------------------ */
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const container = chartContainerRef.current;
    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 390,
      layout: {
        background: { color: isDark ? "#111" : "#fff" },
        textColor: isDark ? "#eee" : "#1a1a1a"
      },
      grid: {
        vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" }
      }
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
      bottomColor: "rgba(0,0,0,0)"
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => chart.resize(container.clientWidth, 390);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  /* ------------------------------------------------------
     THEME CHANGE
  ------------------------------------------------------ */
  useEffect(() => {
    const handler = () => {
      if (!chartRef.current || !seriesRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");

      chartRef.current.applyOptions({
        layout: {
          background: { color: isDark ? "#111" : "#fff" },
          textColor: isDark ? "#eee" : "#1a1a1a"
        },
        grid: {
          vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
          horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" }
        }
      });

      seriesRef.current.applyOptions({
        lineColor: isDark ? "#4ea1f7" : "#3b82f6",
        topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
      });
    };

    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);
  /* ------------------------------------------------------
     LOAD CHART RANGE (INCLUDING ALL)
  ------------------------------------------------------ */
  const updateChart = useCallback(async () => {
    if (!fromCoin || !toCoin || !seriesRef.current) return;

    const days = RANGE_DAYS[range];
    const key = `pair-${fromCoin.id}-${toCoin.id}-${days}`;

    let data: PricePoint[] | null = null;

    // Try localStorage
    const ls = localStorage.getItem(key);
    if (ls) data = JSON.parse(ls);

    // Load fresh data (ALL loads only here)
    if (!data) {
      const [a, b] = await Promise.all([
        fetchHistory(fromCoin, days),
        fetchHistory(toCoin, days),
      ]);

      data = mergeNearest(a, b);
      localStorage.setItem(key, JSON.stringify(data));
    }

    lastValidData.current = data;
    seriesRef.current.setData(data);
    chartRef.current.timeScale().fitContent();
  }, [range, fromCoin, toCoin, fetchHistory, mergeNearest]);

  useEffect(() => {
    updateChart();
  }, [range, fromCoin, toCoin, updateChart]);
  /* ------------------------------------------------------
     FILTER & RENDER DROPDOWNS (UI UNCHANGED)
  ------------------------------------------------------ */
  const filteredCoins = useCallback(
    (input: string) => {
      if (!input) return allCoins;
      const s = input.toLowerCase();
      return allCoins.filter(
        c =>
          c.symbol.toLowerCase().includes(s) ||
          c.name.toLowerCase().includes(s)
      );
    },
    [allCoins]
  );

  const renderRow = useCallback(
    (coin: Coin, type: "from" | "to") => {
      const disabled =
        (type === "from" && toCoin && coin.id === toCoin.id) ||
        (type === "to" && fromCoin && coin.id === fromCoin.id);

      const selected =
        (type === "from" && fromCoin && coin.id === fromCoin.id) ||
        (type === "to" && toCoin && coin.id === toCoin.id);

      let cls = "dropdown-row";
      if (selected) cls += " dropdown-selected";
      if (disabled) cls += " dropdown-disabled";

      return (
        <div
          key={coin.id}
          className={cls}
          onClick={() => {
            if (disabled) return;

            if (type === "from") setFromCoin(coin);
            else setToCoin(coin);

            setOpenDropdown(null);
            setFromSearch("");
            setToSearch("");
          }}
        >
          <img src={coin.image} className="dropdown-flag" />
          <div className="dropdown-text">
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
      const ref = type === "from" ? fromPanelRef : toPanelRef;

      return (
        <div className="dropdown-panel" ref={ref}>
          <input
            className="dropdown-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filteredCoins(search).map((coin) => renderRow(coin, type))}
        </div>
      );
    },
    [filteredCoins, renderRow, fromSearch, toSearch]
  );

  /* ------------------------------------------------------
     CLOSE DROPDOWN ON OUTSIDE CLICK
  ------------------------------------------------------ */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        openDropdown === "from" &&
        fromPanelRef.current &&
        !fromPanelRef.current.contains(e.target as Node)
      ) {
        setOpenDropdown(null);
        setFromSearch("");
      }

      if (
        openDropdown === "to" &&
        toPanelRef.current &&
        !toPanelRef.current.contains(e.target as Node)
      ) {
        setOpenDropdown(null);
        setToSearch("");
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);
  /* ------------------------------------------------------
     FINAL RENDER (UI PRESERVED 100%)
  ------------------------------------------------------ */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "24px" }}>

      {/* AMOUNT / FROM / TO */}
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
            className="amount-input"
            style={{
              width: "260px",
              padding: "14px 16px",
              borderRadius: "14px",
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              fontSize: "18px",
            }}
          />
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
            <img src={fromCoin?.image} className="selector-img" />
            <div>
              <div className="selector-symbol">{fromCoin?.symbol}</div>
              <div className="selector-name">{fromCoin?.name}</div>
            </div>
          </div>
          {openDropdown === "from" && renderDropdown("from")}
        </div>

        {/* SWAP */}
        <div
          onClick={() => {
            if (fromCoin && toCoin) {
              const tmp = fromCoin;
              setFromCoin(toCoin);
              setToCoin(tmp);
            }
          }}
          style={{ marginTop: "38px" }}
          className="swap-circle"
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
            <img src={toCoin?.image} className="selector-img" />
            <div>
              <div className="selector-symbol">{toCoin?.symbol}</div>
              <div className="selector-name">{toCoin?.name}</div>
            </div>
          </div>
          {openDropdown === "to" && renderDropdown("to")}
        </div>
      </div>

      {/* RESULT (IMPROVED) */}
      {fromCoin && toCoin && (
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <div style={{ fontSize: "22px", opacity: 0.65 }}>
            1 {fromCoin.symbol} → {toCoin.symbol}
          </div>

          {result !== null ? (
            <div style={{ fontSize: "60px", fontWeight: 700 }}>
              {result.toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
              {toCoin.symbol}
            </div>
          ) : (
            <div style={{ fontSize: "20px", color: "red", marginTop: "14px" }}>
              Enter amount
            </div>
          )}
        </div>
      )}

      {/* RANGE BUTTONS */}
      <div style={{ textAlign: "center", marginTop: "35px" }}>
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={range === r ? "range-btn-active" : "range-btn"}
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
      ></div>
    </div>
  );
}
