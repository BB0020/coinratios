"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

interface PricePoint {
  time: number;
  value: number;
}

export default function Page() {
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);

  const [range, setRange] = useState("24H");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const lastValidData = useRef<PricePoint[]>([]);
  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  /* --------------------------------------------------
     LOAD COINS + SET DEFAULTS
  -------------------------------------------------- */
  useEffect(() => {
    async function loadCoins() {
      const r = await fetch("/api/coins");
      const data = await r.json();

      setAllCoins(data);

      const btc = data.find((c: Coin) => c.id === "bitcoin");
      const usd = data.find((c: Coin) => c.id === "usd");

      setFromCoin(btc || data[0]);
      setToCoin(usd || data[1]);
    }
    loadCoins();
  }, []);

  /* --------------------------------------------------
     CLICK OUTSIDE DROPDOWNS
  -------------------------------------------------- */
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

  /* --------------------------------------------------
     FILTER & RENDER COINS
  -------------------------------------------------- */
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

          {filteredCoins(search).map((c) => renderRow(c, type))}
        </div>
      );
    },
    [filteredCoins, renderRow, fromSearch, toSearch]
  );

  /* --------------------------------------------------
     SWAP TOKENS
  -------------------------------------------------- */
  const handleSwap = () => {
    if (fromCoin && toCoin) {
      setFromCoin(toCoin);
      setToCoin(fromCoin);
    }
  };

  /* --------------------------------------------------
     PRICE FETCH (NEW FAST METHOD)
  -------------------------------------------------- */
  const fetchPrice = useCallback(
    async (from: string, to: string) => {
      const r = await fetch(`/api/price?from=${from}&to=${to}`);
      return await r.json();
    },
    []
  );

  /* --------------------------------------------------
     COMPUTE RESULT
  -------------------------------------------------- */
  const computeResult = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setResult(null);
      return;
    }

    const price = await fetchPrice(fromCoin.id, toCoin.id);
    if (!price || !price.price) {
      setResult(null);
      return;
    }

    setResult(price.price * amt);
  }, [amount, fromCoin, toCoin, fetchPrice]);

  useEffect(() => {
    if (!fromCoin || !toCoin) return;

    const delay = setTimeout(() => computeResult(), 120);
    return () => clearTimeout(delay);
  }, [fromCoin, toCoin, amount, computeResult]);

  /* --------------------------------------------------
     RANGE → DAYS
  -------------------------------------------------- */
  function rangeToDays(r: string) {
    switch (r) {
      case "24H": return 1;
      case "7D": return 7;
      case "1M": return 30;
      case "3M": return 90;
      case "6M": return 180;
      case "1Y": return 365;
      default: return 30;
    }
  }

  /* --------------------------------------------------
     HISTORY FETCH
  -------------------------------------------------- */
  const fetchHistory = useCallback(async (coin: Coin, days: number) => {
    const r = await fetch(`/api/history?id=${coin.id}&days=${days}`);
    return await r.json();
  }, []);

  function mergeNearest(a: PricePoint[], b: PricePoint[], combine: (x: number, y: number) => number) {
    const out: PricePoint[] = [];
    let j = 0;

    for (let i = 0; i < a.length; i++) {
      while (
        j < b.length - 1 &&
        Math.abs(b[j + 1].time - a[i].time) < Math.abs(b[j].time - a[i].time)
      ) {
        j++;
      }
      out.push({ time: a[i].time, value: combine(a[i].value, b[j].value) });
    }
    return out;
  }

  const computeHistory = useCallback(async () => {
    if (!fromCoin || !toCoin) return lastValidData.current;

    const days = rangeToDays(range);
    const [fromH, toH] = await Promise.all([
      fetchHistory(fromCoin, days),
      fetchHistory(toCoin, days),
    ]);

    if (!fromH.length || !toH.length) return lastValidData.current;

    const merged = mergeNearest(fromH, toH, (a, b) => a / b);
    lastValidData.current = merged;
    return merged;
  }, [fromCoin, toCoin, range, fetchHistory]);

  /* --------------------------------------------------
     CHART INIT
  -------------------------------------------------- */
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const container = chartContainerRef.current;
    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { color: isDark ? "#111" : "#fff" },
        textColor: isDark ? "#eee" : "#222",
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

    const resize = () => chart.resize(container.clientWidth, 380);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, []);

  /* --------------------------------------------------
     CHART UPDATE
  -------------------------------------------------- */
  useEffect(() => {
    let active = true;

    async function update() {
      if (!chartRef.current || !seriesRef.current) return;

      // Pre-fill with previous data
      if (lastValidData.current.length > 0) {
        seriesRef.current.setData(lastValidData.current);
        chartRef.current.timeScale().fitContent();
      }

      const fresh = await computeHistory();
      if (!active) return;

      seriesRef.current.setData(fresh);
      chartRef.current.timeScale().fitContent();
    }

    update();
    return () => { active = false; };
  }, [computeHistory]);

  /* --------------------------------------------------
     RESULT DISPLAY
  -------------------------------------------------- */
  const renderResult = () => {
    if (!fromCoin || !toCoin) return null;

    if (result === null) {
      return (
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <div style={{ fontSize: "22px", opacity: 0.65 }}>Loading price…</div>
        </div>
      );
    }

    const baseRate = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "40px" }}>
        <div style={{ fontSize: "22px", opacity: 0.65 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div style={{ fontSize: "56px", fontWeight: 700, marginTop: "10px" }}>
          {result.toLocaleString(undefined, { maximumFractionDigits: 8 })} {toCoin.symbol}
        </div>

        <div style={{ marginTop: "10px", opacity: 0.7 }}>
          1 {fromCoin.symbol} = {baseRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} {toCoin.symbol}
          <br />
          1 {toCoin.symbol} = {(1 / baseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })} {fromCoin.symbol}
        </div>
      </div>
    );
  };

  /* --------------------------------------------------
     MAIN LAYOUT
  -------------------------------------------------- */
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
            <div style={{ color: "red", marginTop: "6px", fontSize: "14px", fontWeight: 500 }}>
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

      {renderResult()}

      {/* RANGE BUTTONS */}
      <div style={{ textAlign: "center", marginTop: "30px" }}>
        {["24H", "7D", "1M", "3M", "6M", "1Y"].map((r) => (
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
