"use client";

import { useEffect, useState, useRef } from "react";
import { createChart } from "lightweight-charts";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

const allCoins: Coin[] = [
  {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    type: "crypto",
  },
  {
    id: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
    type: "crypto",
  },
  {
    id: "usd",
    symbol: "USD",
    name: "US Dollar",
    image: "https://flagcdn.com/us.svg",
    type: "fiat",
  },
  {
    id: "eur",
    symbol: "EUR",
    name: "Euro",
    image: "https://flagcdn.com/eu.svg",
    type: "fiat",
  },
];

export default function Page() {
  const [amount, setAmount] = useState("1");

  // Independent search fields
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [fromCoin, setFromCoin] = useState<Coin | null>(
    allCoins.find((c) => c.id === "bitcoin") || null
  );
  const [toCoin, setToCoin] = useState<Coin | null>(
    allCoins.find((c) => c.id === "usd") || null
  );

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const [result, setResult] = useState<number | null>(null);
  const [range, setRange] = useState("24H");

  // Track last valid chart data so chart never goes blank (CMC style)
  const lastValidData = useRef<any[]>([]);

  // Refs for clicking outside dropdowns
  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  // Chart container reference
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  // Track theme from layout
  const [theme, setTheme] = useState<string>("light");

  // Detect change from layout.tsx
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.className);
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openDropdown === "from") {
        if (fromPanelRef.current && !fromPanelRef.current.contains(e.target as Node)) {
          setOpenDropdown(null);
          setFromSearch("");
        }
      }

      if (openDropdown === "to") {
        if (toPanelRef.current && !toPanelRef.current.contains(e.target as Node)) {
          setOpenDropdown(null);
          setToSearch("");
        }
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  const filteredCoins = (search: string) => {
    if (!search) return allCoins;
    const s = search.toLowerCase();
    return allCoins.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.symbol.toLowerCase().includes(s)
    );
  };

  // Fetch conversion rate instantly
  async function fetchRate(from: Coin, to: Coin) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=${to.id}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data[from.id] && data[from.id][to.id]) {
        const rate = data[from.id][to.id];
        setResult(rate * Number(amount));
      }
    } catch (err) {
      console.error("Price fetch error:", err);
    }
  }

  // Auto-update rate on coin change, swap, or amount change
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    if (amount === "" || Number(amount) <= 0) return;
    fetchRate(fromCoin, toCoin);
  }, [fromCoin, toCoin, amount]);

  // Handle swap instantly
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;
    const temp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(temp);

    // Instant refresh
    fetchRate(toCoin, fromCoin);
  };
  // Render dropdown row with disabled + selected + hover logic
  const renderRow = (
    coin: Coin,
    type: "from" | "to",
    search: string
  ) => {
    const isDisabled =
      (type === "from" && coin.id === toCoin?.id) ||
      (type === "to" && coin.id === fromCoin?.id);

    const isSelected =
      (type === "from" && coin.id === fromCoin?.id) ||
      (type === "to" && coin.id === toCoin?.id);

    let className = "dropdown-row";
    if (isDisabled) className += " dropdown-disabled";
    else if (isSelected) className += " dropdown-selected";

    return (
      <div
        key={coin.id}
        className={className}
        onClick={() => {
          if (isDisabled) return;

          if (type === "from") setFromCoin(coin);
          if (type === "to") setToCoin(coin);

          setOpenDropdown(null);
          setFromSearch("");
          setToSearch("");

          // INSTANT refresh (CMC style experience)
          fetchRate(
            type === "from" ? coin : fromCoin!,
            type === "to" ? coin : toCoin!
          );
        }}
      >
        <img className="dropdown-flag" src={coin.image} />
        <span className="dropdown-symbol">{coin.symbol}</span>
        {coin.name}
      </div>
    );
  };

  const renderDropdown = (type: "from" | "to") => {
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
          renderRow(coin, type, search)
        )}
      </div>
    );
  };

  /* -------------------------------------------------------------
     CHART RANGE → days mapping
  ------------------------------------------------------------- */
  function rangeToDays(range: string) {
    switch (range) {
      case "24H": return 1;
      case "7D": return 7;
      case "1M": return 30;
      case "3M": return 90;
      case "6M": return 180;
      case "1Y": return 365;
      case "ALL": return 730;
      default: return 30;
    }
  }

  /* -------------------------------------------------------------
     Fetch historical chart data
     - Returns [] if no valid data (we handle fallback)
  ------------------------------------------------------------- */
  async function fetchHistory(id: string, vs: string, range: string) {
    const days = rangeToDays(range);

    const url =
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
      `?vs_currency=${vs}&days=${days}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!data.prices || data.prices.length === 0) {
        return [];
      }

      return data.prices.map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    } catch (err) {
      console.error("History fetch error:", err);
      return [];
    }
  }

  /* -------------------------------------------------------------
     FULL Chart Rebuild:
     - Runs on: fromCoin, toCoin, range, theme
     - NEVER allows blank chart (CMC style)
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!fromCoin || !toCoin) return;

    const container = chartContainerRef.current;
    container.innerHTML = ""; // clear

    const isDark = theme === "dark";

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 360,
      layout: {
        background: { color: isDark ? "#1a1a1a" : "#ffffff" },
        textColor: isDark ? "#e5e5e5" : "#1a1a1a",
      },
      grid: {
        vertLines: { color: isDark ? "#2d2d2d" : "#ececec" },
        horzLines: { color: isDark ? "#2d2d2d" : "#ececec" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.40)" : "rgba(59,130,246,0.40)",
      bottomColor: "rgba(0,0,0,0)",
    });

    /* -----------------------------
       Load History with CMC fallback
    ----------------------------- */
    fetchHistory(fromCoin.id, toCoin.id, range).then((data) => {
      if (data.length > 0) {
        lastValidData.current = data; // store
        series.setData(data);
        chart.timeScale().fitContent();
      } else {
        // fallback: never blank
        series.setData(lastValidData.current);
        chart.timeScale().fitContent();
      }
    });

    /* -----------------------------
       Resize handler
    ----------------------------- */
    const handleResize = () => {
      chart.resize(container.clientWidth, 360);
      chart.timeScale().fitContent();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [fromCoin, toCoin, range, theme]);
  /* -------------------------------------------------------------
     Range Buttons
  ------------------------------------------------------------- */
  const RangeButtons = () => {
    const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"];

    return (
      <div style={{ textAlign: "center", marginTop: "30px" }}>
        {ranges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: "10px 18px",
              margin: "0 6px",
              borderRadius: "999px",
              border:
                range === r
                  ? "1px solid #3b82f6"
                  : "1px solid var(--card-border)",
              background: range === r ? "#3b82f6" : "var(--card-bg)",
              color: range === r ? "#ffffff" : "inherit",
              boxShadow:
                range === r ? "0 0 6px rgba(59,130,246,0.45)" : "none",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 600,
              transition: "0.15s",
            }}
          >
            {r}
          </button>
        ))}
      </div>
    );
  };

  /* -------------------------------------------------------------
     Conversion Result Text
  ------------------------------------------------------------- */
  const renderResult = () => {
    if (!fromCoin || !toCoin || result === null) return null;

    const baseRate = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "50px" }}>
        <div style={{ fontSize: "22px", opacity: 0.7 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div
          style={{
            fontSize: "64px",
            fontWeight: 700,
            marginTop: "12px",
            lineHeight: "1.15",
          }}
        >
          {result.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          })}{" "}
          {toCoin.symbol}
        </div>

        <div
          style={{
            opacity: 0.7,
            marginTop: "14px",
            fontSize: "20px",
            lineHeight: "1.6",
          }}
        >
          1 {fromCoin.symbol} ={" "}
          {baseRate.toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
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

  /* -------------------------------------------------------------
     Component Layout
  ------------------------------------------------------------- */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "28px" }}>

      {/* TOP FLEX */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: "32px",
          flexWrap: "wrap",
          width: "100%",
          marginTop: "28px",
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
              const val = e.target.value;
              if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
                setAmount(val);
              }
            }}
            style={{
              width: "220px",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              fontSize: "18px",
              color: "var(--text)", // DARK MODE FIX
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
              Enter a number greater than 0
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
            <img className="selector-img" src={fromCoin?.image} />
            <div>
              <div className="selector-symbol">{fromCoin?.symbol}</div>
              <div className="selector-name">{fromCoin?.name}</div>
            </div>
          </div>

          {openDropdown === "from" && renderDropdown("from")}
        </div>

        {/* SWAP */}
        <div
          onClick={handleSwap}
          className="swap-circle"
          style={{ marginTop: "36px" }}
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
            <img className="selector-img" src={toCoin?.image} />
            <div>
              <div className="selector-symbol">{toCoin?.symbol}</div>
              <div className="selector-name">{toCoin?.name}</div>
            </div>
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
          height: "380px",
          marginTop: "36px",
          borderRadius: "12px",
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
        }}
      ></div>
    </div>
  );
}
