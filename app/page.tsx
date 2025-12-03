"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

/* ------------------------------------------------------
   INTERFACES
------------------------------------------------------ */
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

interface PricePoint {
  time: number; // UNIX seconds
  value: number; // price in USD
}

/* ------------------------------------------------------
   FIAT LIST
------------------------------------------------------ */
const fiatSymbols = [
  "USD","AUD","BRL","CAD","CHF","CNY","DKK","EUR","GBP","HKD",
  "INR","JPY","KRW","MXN","NOK","NZD","SEK","SGD","TRY","ZAR",
];

/* ------------------------------------------------------
   PAGE
------------------------------------------------------ */
export default function Page() {
  /* STATE */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [openDropdown, setOpenDropdown] = useState<"from"|"to"|null>(null);

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);
  const [range, setRange] = useState("24H");

  /* REFS */
  const chartContainerRef = useRef<HTMLDivElement|null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const lastValidData = useRef<PricePoint[]>([]);

  const fromPanelRef = useRef<HTMLDivElement|null>(null);
  const toPanelRef = useRef<HTMLDivElement|null>(null);
  /* ------------------------------------------------------
     LOAD COINS (1250 crypto + fiats)
  ------------------------------------------------------ */
  useEffect(() => {
    async function loadCoins() {
      const res = await fetch("/api/coins");
      const data = await res.json();

      setAllCoins(data);

      // default: BTC → USD
      const btc = data.find((c: Coin) => c.id === "bitcoin");
      const usd = data.find((c: Coin) => c.id === "usd");

      setFromCoin(btc || data[1]);
      setToCoin(usd || data[0]);
    }

    loadCoins();
  }, []);
  /* ------------------------------------------------------
     CLICK OUTSIDE TO CLOSE DROPDOWN
  ------------------------------------------------------ */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openDropdown === "from" &&
          fromPanelRef.current &&
          !fromPanelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setFromSearch("");
      }

      if (openDropdown === "to" &&
          toPanelRef.current &&
          !toPanelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setToSearch("");
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  /* ------------------------------------------------------
     FILTER COINS
  ------------------------------------------------------ */
  const filteredCoins = useCallback(
    (input: string) => {
      if (!input) return allCoins;
      const s = input.toLowerCase();
      return allCoins.filter(
        (c) =>
          c.symbol.toLowerCase().includes(s) ||
          c.name.toLowerCase().includes(s)
      );
    },
    [allCoins]
  );

  /* ------------------------------------------------------
     SWAP COINS
  ------------------------------------------------------ */
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;
    setFromCoin(toCoin);
    setToCoin(fromCoin);
  };
  /* ------------------------------------------------------
     REALTIME PRICE FETCH (BATCHED)
  ------------------------------------------------------ */
  const fetchPrices = useCallback(async (ids: string[]) => {
    const q = ids.join(",");
    const res = await fetch(`/api/price?ids=${q}`);
    return await res.json();
  }, []);

  /* ------------------------------------------------------
     COMPUTE RESULT
  ------------------------------------------------------ */
  const computeResult = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setResult(null);
      return;
    }

    const ids = [fromCoin.symbol, toCoin.symbol];
    const p = await fetchPrices(ids);

    const fromUSD = p[fromCoin.symbol] ?? 0;
    const toUSD = p[toCoin.symbol] ?? 1;

    const finalRate = fromUSD / toUSD;
    setResult(finalRate * amt);
  }, [fromCoin, toCoin, amount, fetchPrices]);

  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    const t = setTimeout(computeResult, 250);
    return () => clearTimeout(t);
  }, [fromCoin, toCoin, amount, computeResult]);
  /* ------------------------------------------------------
     RANGE MAPPING
  ------------------------------------------------------ */
  function rangeToDays(r: string) {
    switch (r) {
      case "24H": return 1;
      case "7D":  return 7;
      case "1M":  return 30;
      case "3M":  return 90;
      case "6M":  return 180;
      case "1Y":  return 365;
      default:    return 30;
    }
  }

  /* ------------------------------------------------------
     FETCH HISTORY FROM API
  ------------------------------------------------------ */
  const fetchHistory = useCallback(async (coin: Coin, days: number) => {
    return await fetch(
      `/api/history?id=${coin.id}&days=${days}`
    ).then((r) => r.json());
  }, []);

  /* ------------------------------------------------------
     MERGE TWO USD HISTORIES
  ------------------------------------------------------ */
  function mergeNearest(
    a: PricePoint[],
    b: PricePoint[],
    combine: (x: number, y: number) => number
  ) {
    const out: PricePoint[] = [];
    let j = 0;

    for (let i = 0; i < a.length; i++) {
      while (
        j < b.length - 1 &&
        Math.abs(b[j + 1].time - a[i].time) <
        Math.abs(b[j].time - a[i].time)
      ) j++;

      out.push({
        time: a[i].time,
        value: combine(a[i].value, b[j].value),
      });
    }

    return out;
  }

  /* ------------------------------------------------------
     COMPUTE HISTORY
  ------------------------------------------------------ */
  const computeHistory = useCallback(async () => {
    if (!fromCoin || !toCoin) return lastValidData.current;

    const days = rangeToDays(range);

    const [fromHist, toHist] = await Promise.all([
      fetchHistory(fromCoin, days),
      fetchHistory(toCoin, days),
    ]);

    if (!fromHist.length || !toHist.length)
      return lastValidData.current;

    const merged = mergeNearest(fromHist, toHist, (a, b) => a / b);
    lastValidData.current = merged;
    return merged;
  }, [fromCoin, toCoin, range, fetchHistory]);

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

    const handleResize = () =>
      chart.resize(container.clientWidth, 390);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  /* ------------------------------------------------------
     UPDATE CHART
  ------------------------------------------------------ */
  useEffect(() => {
    async function updateChart() {
      if (!chartRef.current || !seriesRef.current) return;

      const data = await computeHistory();
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
    }
    updateChart();
  }, [computeHistory]);

  /* ------------------------------------------------------
     THEME CHANGE SYNC
  ------------------------------------------------------ */
  useEffect(() => {
    const applyTheme = () => {
      if (!chartRef.current || !seriesRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");

      chartRef.current.applyOptions({
        layout: {
          background: { color: isDark ? "#111" : "#fff" },
          textColor: isDark ? "#eee" : "#1a1a1a",
        },
        grid: {
          vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
          horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        },
      });

      seriesRef.current.applyOptions({
        lineColor: isDark ? "#4ea1f7" : "#3b82f6",
        topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
      });
    };

    window.addEventListener("theme-change", applyTheme);
    return () => window.removeEventListener("theme-change", applyTheme);
  }, []);
  /* ------------------------------------------------------
     RENDER DROPDOWN ROW
  ------------------------------------------------------ */
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
          <div className="dropdown-text">
            <div className="dropdown-symbol">{coin.symbol}</div>
            <div className="dropdown-name">{coin.name}</div>
          </div>
        </div>
      );
    },
    [fromCoin, toCoin]
  );

  /* ------------------------------------------------------
     RENDER DROPDOWN PANEL
  ------------------------------------------------------ */
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
     RESULT BLOCK
  ------------------------------------------------------ */
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

  /* ------------------------------------------------------
     RANGE BUTTONS
  ------------------------------------------------------ */
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

  /* ------------------------------------------------------
     MAIN RENDER
  ------------------------------------------------------ */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "22px" }}>
      {/* THEME TOGGLE */}
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
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                setAmount(v);
              }
            }}
            style={{
              width: "260px",
              padding: "14px 16px",
              borderRadius: "14px",
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              fontSize: "18px",
            }}
          />

          {(amount === "" || Number(amount) <= 0) && (
            <div
              style={{
                color: "red",
                marginTop: "6px",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              Enter a Number Greater than 0
            </div> )}
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
        <div onClick={handleSwap} style={{ marginTop: "38px" }} className="swap-circle">
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
        }}
      />
    </div>
  );
}
