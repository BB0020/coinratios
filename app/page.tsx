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

  /* ------------------------------
      LOAD COINS (FIAT + 1250 crypto)
  ------------------------------ */
  useEffect(() => {
    async function loadCoins() {
      const res = await fetch("/api/coins");
      const data = await res.json();

      setAllCoins(data);

      const usd = data.find((c: Coin) => c.id === "usd");
      const btc = data.find((c: Coin) => c.id === "bitcoin");

      setFromCoin(btc || data[0]);
      setToCoin(usd || data[1]);
    }
    loadCoins();
  }, []);

  /* ------------------------------
      CLICK OUTSIDE DROPDOWN
  ------------------------------ */
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

  /* ------------------------------
      FILTER COINS
  ------------------------------ */
  const filteredCoins = useCallback(
    (q: string) => {
      if (!q) return allCoins;
      q = q.toLowerCase();
      return allCoins.filter(
        (c) =>
          c.symbol.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      );
    },
    [allCoins]
  );

  /* ------------------------------
      SWAP TOKENS
  ------------------------------ */
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;
    setFromCoin(toCoin);
    setToCoin(fromCoin);
  };

  /* ------------------------------
      FETCH CURRENT PRICES
  ------------------------------ */
  const fetchPrices = useCallback(async (ids: string[]) => {
    const q = ids.join(",");
    const r = await fetch(`/api/price?ids=${q}`);
    return await r.json();
  }, []);

  /* ------------------------------
      COMPUTE RESULT
  ------------------------------ */
  const computeResult = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setResult(null);
      return;
    }

    const prices = await fetchPrices([fromCoin.id, toCoin.id]);

    const fromUSD = prices[fromCoin.id] ?? 0;
    const toUSD = prices[toCoin.id] ?? 1;

    setResult((fromUSD / toUSD) * amt);
  }, [fromCoin, toCoin, amount, fetchPrices]);

  useEffect(() => {
    const t = setTimeout(() => computeResult(), 150);
    return () => clearTimeout(t);
  }, [fromCoin, toCoin, amount, computeResult]);

  /* ------------------------------
      RANGE → DAYS
  ------------------------------ */
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

  /* ------------------------------
      FETCH HISTORY (USD Price)
  ------------------------------ */
  const fetchHistory = useCallback(async (id: string, days: number) => {
    const r = await fetch(`/api/history?id=${id}&days=${days}`);
    return await r.json();
  }, []);

  function mergeNearest(a: PricePoint[], b: PricePoint[], combine: (x: number, y: number) => number) {
    const out: PricePoint[] = [];
    let j = 0;

    for (let i = 0; i < a.length; i++) {
      while (
        j < b.length - 1 &&
        Math.abs(b[j + 1].time - a[i].time) <
        Math.abs(b[j].time - a[i].time)
      ) {
        j++;
      }

      out.push({
        time: a[i].time,
        value: combine(a[i].value, b[j].value),
      });
    }

    return out;
  }

  /* ------------------------------
      COMPUTE RATIO HISTORY
  ------------------------------ */
  const computeHistory = useCallback(async () => {
    if (!fromCoin || !toCoin) return lastValidData.current;

    const days = rangeToDays(range);

    const [fromHist, toHist] = await Promise.all([
      fetchHistory(fromCoin.id, days),
      fetchHistory(toCoin.id, days),
    ]);

    if (!fromHist.length || !toHist.length) return lastValidData.current;

    const merged = mergeNearest(fromHist, toHist, (a, b) => a / b);
    lastValidData.current = merged;

    return merged;
  }, [fromCoin, toCoin, range, fetchHistory]);

  /* ------------------------------
      INIT CHART
  ------------------------------ */
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const container = chartContainerRef.current;
    const dark = document.documentElement.classList.contains("dark");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { color: dark ? "#111" : "#fff" },
        textColor: dark ? "#eee" : "#222",
      },
      grid: {
        vertLines: { color: dark ? "#2a2a2a" : "#e3e3e3" },
        horzLines: { color: dark ? "#2a2a2a" : "#e3e3e3" },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: dark ? "#4ea1f7" : "#3b82f6",
      topColor: dark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
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

  /* ------------------------------
      UPDATE CHART
  ------------------------------ */
  useEffect(() => {
    let active = true;

    async function update() {
      if (!seriesRef.current) return;

      const data = await computeHistory();
      if (!active) return;

      seriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    }

    update();
    return () => {
      active = false;
    };
  }, [computeHistory]);

  /* ------------------------------
      RENDER RESULT
  ------------------------------ */
  const renderResult = () => {
    if (!fromCoin || !toCoin) return null;

    if (result === null) {
      return (
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <div style={{ opacity: 0.6 }}>Loading price…</div>
        </div>
      );
    }

    const baseRate = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <div style={{ opacity: 0.65, fontSize: 22 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div style={{ fontSize: 56, fontWeight: 700, marginTop: 10 }}>
          {result.toLocaleString(undefined, { maximumFractionDigits: 8 })} {toCoin.symbol}
        </div>

        <div style={{ marginTop: 10, opacity: 0.7 }}>
          1 {fromCoin.symbol} =
          {" "}{baseRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} {toCoin.symbol}
          <br />
          1 {toCoin.symbol} =
          {" "}{(1 / baseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })} {fromCoin.symbol}
        </div>
      </div>
    );
  };

  /* ------------------------------
      DROPDOWNS
  ------------------------------ */
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

          {filteredCoins(search).map((coin) => renderRow(coin, type))}
        </div>
      );
    },
    [filteredCoins, renderRow, fromSearch, toSearch]
  );

  /* ------------------------------
      MAIN RENDER
  ------------------------------ */
  return (
    <div style={{ maxWidth: 1150, margin: "0 auto", padding: 22 }}>
      <div style={{ textAlign: "right", marginBottom: 10 }}>
        <ThemeToggle />
      </div>

      {/* TOP ROW */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        {/* AMOUNT */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h3>AMOUNT</h3>
          <input
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                setAmount(v);
              }
            }}
            style={{
              width: 260,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              fontSize: 18,
            }}
          />

          {(amount === "" || Number(amount) <= 0) && (
            <div style={{ color: "red", marginTop: 6, fontSize: 14 }}>
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
        <div onClick={handleSwap} style={{ marginTop: 38 }} className="swap-circle">
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
      <div style={{ textAlign: "center", marginTop: 30 }}>
        {["24H", "7D", "1M", "3M", "6M", "1Y"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: "8px 14px",
              margin: "0 4px",
              borderRadius: 8,
              border: "1px solid var(--card-border)",
              background: r === range ? "var(--accent)" : "var(--card-bg)",
              color: r === range ? "#fff" : "var(--text)",
              cursor: "pointer",
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
          height: 400,
          marginTop: 35,
          borderRadius: 14,
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
        }}
      />
    </div>
  );
}
