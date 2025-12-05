"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

/* -----------------------------------------------------
   TYPES
----------------------------------------------------- */
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
  /* -----------------------------------------------------
     STATE
  ----------------------------------------------------- */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [openDropdown, setOpenDropdown] =
    useState<"from" | "to" | null>(null);

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);

  const [range, setRange] = useState("24H");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const lastValidData = useRef<PricePoint[]>([]);

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  /* -----------------------------------------------------
     LOAD COINS (FIAT + 1250 CRYPTO)
  ----------------------------------------------------- */
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/coins");
      const data = await res.json();

      setAllCoins(data);

      const btc = data.find((c: Coin) => c.id === "bitcoin");
      const usd = data.find((c: Coin) => c.id === "usd");

      setFromCoin(btc || data[0]);
      setToCoin(usd || data[1]);
    }
    load();
  }, []);

  /* -----------------------------------------------------
     CLICK OUTSIDE TO CLOSE DROPDOWN
  ----------------------------------------------------- */
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

  /* -----------------------------------------------------
     FILTER COINS
  ----------------------------------------------------- */
  const filteredCoins = useCallback(
    (query: string) => {
      if (!query) return allCoins;
      const s = query.toLowerCase();
      return allCoins.filter(
        (c) =>
          c.symbol.toLowerCase().includes(s) ||
          c.name.toLowerCase().includes(s)
      );
    },
    [allCoins]
  );

  /* -----------------------------------------------------
     SWAP TOKENS
  ----------------------------------------------------- */
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;
    setFromCoin(toCoin);
    setToCoin(fromCoin);
  };

  /* -----------------------------------------------------
     FETCH PRICE
  ----------------------------------------------------- */
  const fetchPrice = useCallback(async (ids: string[]) => {
    const q = ids.join(",");
    const res = await fetch(`/api/price?ids=${q}`);
    return await res.json();
  }, []);

  /* -----------------------------------------------------
     COMPUTE RESULT
  ----------------------------------------------------- */
  const computeResult = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setResult(null);
      return;
    }

    const prices = await fetchPrice([fromCoin.id, toCoin.id]);

    const fromUSD = prices[fromCoin.id] ?? 0;
    const toUSD = prices[toCoin.id] ?? 1;

    const rate = fromUSD / toUSD;
    setResult(rate * amt);
  }, [amount, fromCoin, toCoin, fetchPrice]);

  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    const t = setTimeout(() => computeResult(), 120);
    return () => clearTimeout(t);
  }, [fromCoin, toCoin, amount, computeResult]);

  /* -----------------------------------------------------
     RANGE → DAYS
  ----------------------------------------------------- */
  const rangeToDays = (r: string) => {
    switch (r) {
      case "24H":
        return 1;
      case "7D":
        return 7;
      case "1M":
        return 30;
      case "3M":
        return 90;
      case "6M":
        return 180;
      case "1Y":
        return 365;
      default:
        return 30;
    }
  };

  /* -----------------------------------------------------
     HISTORY MERGING
  ----------------------------------------------------- */
  const fetchHistory = useCallback(async (coin: Coin, days: number) => {
    const res = await fetch(`/api/history?id=${coin.id}&days=${days}`);
    return await res.json();
  }, []);

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

  /* -----------------------------------------------------
     INIT CHART
  ----------------------------------------------------- */
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

    const resize = () =>
      chart.resize(container.clientWidth, 380);

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, []);

  /* -----------------------------------------------------
     UPDATE CHART
  ----------------------------------------------------- */
  useEffect(() => {
    let active = true;

    async function run() {
      if (!seriesRef.current) return;

      // show old instantly
      if (lastValidData.current.length > 0) {
        seriesRef.current.setData(lastValidData.current);
        chartRef.current.timeScale().fitContent();
      }

      const fresh = await computeHistory();
      if (!active) return;

      seriesRef.current.setData(fresh);
      chartRef.current.timeScale().fitContent();
    }

    run();
    return () => {
      active = false;
    };
  }, [computeHistory]);

  /* -----------------------------------------------------
     RESULT BLOCK
  ----------------------------------------------------- */
  const renderResult = () => {
    if (!fromCoin || !toCoin) return null;

    if (result === null) {
      return (
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <div style={{ fontSize: "22px", opacity: 0.65 }}>
            Loading price…
          </div>
        </div>
      );
    }

    const displayed = result;
    const base = displayed / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "40px" }}>
        <div style={{ fontSize: "22px", opacity: 0.65 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div
          style={{
            fontSize: "56px",
            fontWeight: 700,
            marginTop: "10px",
          }}
        >
          {displayed.toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
          {toCoin.symbol}
        </div>

        <div style={{ marginTop: "10px", opacity: 0.7 }}>
          1 {fromCoin.symbol} ={" "}
          {base.toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
          {toCoin.symbol}
          <br />
          1 {toCoin.symbol} ={" "}
          {(1 / base).toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
          {fromCoin.symbol}
        </div>
      </div>
    );
  };

  /* -----------------------------------------------------
     DROPDOWN ROW
  ----------------------------------------------------- */
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

  /* -----------------------------------------------------
     RENDER DROPDOWN
  ----------------------------------------------------- */
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
          {filteredCoins(search).map((coin) =>
            renderRow(coin, type)
          )}
        </div>
      );
    },
    [filteredCoins, renderRow, fromSearch, toSearch]
  );

  /* -----------------------------------------------------
     MAIN UI
  ----------------------------------------------------- */
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
        </div>

        {/* FROM */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
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

        {/* SWAP BUTTON (UNCHANGED ICON) */}
        <div
          onClick={handleSwap}
          style={{ marginTop: "38px" }}
          className="swap-circle"
        >
          <div className="swap-icon" />
        </div>

        {/* TO */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
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
