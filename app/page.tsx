"use client";

import { useEffect, useState, useRef } from "react";
import { createChart } from "lightweight-charts";

// ----------------------
// Types
// ----------------------
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

// ----------------------
// Component
// ----------------------
export default function Page() {
  // UI State
  const [amount, setAmount] = useState("1");
  const [search, setSearch] = useState("");
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);
  const [filtered, setFiltered] = useState<Coin[]>([]);
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
  const [rotated, setRotated] = useState(false);

  // Conversion state
  const [result, setResult] = useState<number | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);

  // Chart
  const [range, setRange] = useState("24H");
  const chartRef = useRef<HTMLDivElement | null>(null);

  // Dropdown panel ref
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ----------------------
  // Coin List (crypto + fiat)
  // You can expand this anytime
  // ----------------------
  const allCoins: Coin[] = [
    { id: "bitcoin", symbol: "BTC", name: "Bitcoin", image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png", type: "crypto" },
    { id: "ethereum", symbol: "ETH", name: "Ethereum", image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png", type: "crypto" },

    // Fiat
    { id: "usd", symbol: "USD", name: "US Dollar", image: "https://flagcdn.com/us.svg", type: "fiat" },
    { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
  ];

  // ----------------------
  // Close dropdown when clicking outside
  // ----------------------
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ----------------------
  // Swap logic
  // ----------------------
  const handleSwap = () => {
    if (fromCoin && toCoin) {
      setRotated(!rotated);
      const f = fromCoin;
      setFromCoin(toCoin);
      setToCoin(f);
      setResult(null); // force recalculation
    }
  };

  // ----------------------
  // Filtering logic
  // ----------------------
  useEffect(() => {
    if (!search) {
      setFiltered(allCoins);
      return;
    }

    const s = search.toLowerCase();
    setFiltered(
      allCoins.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          c.symbol.toLowerCase().includes(s)
      )
    );
  }, [search, allCoins]);
  // ----------------------
  // Fetch conversion rate
  // ----------------------
  const fetchRate = async (from: Coin, to: Coin) => {
    setLoadingRate(true);
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=${to.id}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data[from.id] && data[from.id][to.id]) {
        const rate = data[from.id][to.id];
        setResult(rate * Number(amount));
      }
    } catch (err) {
      console.error("Rate fetch error:", err);
    }
    setLoadingRate(false);
  };

  // Trigger rate calculation when dependencies change
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    if (isNaN(Number(amount)) || Number(amount) <= 0) return;

    fetchRate(fromCoin, toCoin);
  }, [fromCoin, toCoin, amount]);

  // ----------------------
  // Render Result Display
  // ----------------------
  const renderResult = () => {
    if (!fromCoin || !toCoin || result === null) return null;

    return (
      <div style={{ textAlign: "center", marginTop: "50px" }}>
        <div style={{ fontSize: "22px", opacity: 0.7 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div
          style={{
            fontSize: "70px",
            fontWeight: 700,
            marginTop: "10px",
            lineHeight: "1.1",
          }}
        >
          {result.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          })}{" "}
          {toCoin.symbol}
        </div>

        <div style={{ opacity: 0.6, marginTop: "12px", fontSize: "20px" }}>
          1 {fromCoin.symbol} ={" "}
          {(result / Number(amount)).toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
          {toCoin.symbol}
          <br />
          1 {toCoin.symbol} ={" "}
          {(1 / (result / Number(amount))).toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
          {fromCoin.symbol}
        </div>
      </div>
    );
  };
  // ----------------------
  // Range → Days mapping
  // ----------------------
  function rangeToDays(range: string) {
    switch (range) {
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
      case "ALL":
        return 730;
      default:
        return 30;
    }
  }

  // ----------------------
  // Fetch Chart History
  // ----------------------
  async function fetchHistory(id: string, vs: string, range: string) {
    try {
      const days = rangeToDays(range);
      const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${vs}&days=${days}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!data.prices) return [];

      return data.prices.map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    } catch (err) {
      console.error("History fetch failed:", err);
      return [];
    }
  }

  // ----------------------
  // Append Chart to DOM
  // ----------------------
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!fromCoin || !toCoin) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 360,
      layout: {
        background: { color: isDark ? "#1a1a1a" : "#ffffff" },
        textColor: isDark ? "#e5e5e5" : "#1a1a1a",
      },
      grid: {
        vertLines: { color: isDark ? "#2d2d2d" : "#eaeaea" },
        horzLines: { color: isDark ? "#2d2d2d" : "#eaeaea" },
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
      bottomColor: isDark
        ? "rgba(26,26,26,0)"
        : "rgba(160,200,255,0.00)",
    });

    fetchHistory(fromCoin.id, toCoin.id, range).then((data) => {
      series.setData(data);
    });

    // Handle Resize
    const handleResize = () => {
      chart.resize(chartContainerRef.current!.clientWidth, 360);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [fromCoin, toCoin, range]);

  // ----------------------
  // Observe Theme Change → Recreate Chart
  // ----------------------
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setRange((r) => r); // force chart re-render
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  // ----------------------
  // Range Buttons Component
  // ----------------------
  const RangeButtons = () => {
    const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"];

    return (
      <div style={{ textAlign: "center", marginTop: "30px" }}>
        {ranges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: "8px 14px",
              margin: "0 6px",
              borderRadius: "8px",
              border: "1px solid var(--card-border)",
              background: range === r ? "var(--primary)" : "var(--card-bg)",
              color: range === r ? "#fff" : "inherit",
              cursor: "pointer",
            }}
          >
            {r}
          </button>
        ))}
      </div>
    );
  };
  // ----------------------
  // Render
  // ----------------------
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "28px" }}>
      {/* ---------------- AMOUNT + FROM + SWAP + TO ---------------- */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "40px",
          flexWrap: "wrap",
          marginTop: "20px",
        }}
      >
        {/* AMOUNT */}
        <div>
          <h3>AMOUNT</h3>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: "220px",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
            }}
          />
        </div>

        {/* SWAP BUTTON (Modern Option 2) */}
        <div
          onClick={handleSwap}
          className={rotated ? "swap-button-modern rotated" : "swap-button-modern"}
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
            transition: "0.3s",
            marginTop: "30px",
          }}
        >
          <div
            className="swap-icon-modern"
            style={{
              width: "22px",
              height: "22px",
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 24 24' stroke='currentColor' stroke-width='2' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 7h14l-4-4m4 4l-4 4'/%3E%3Cpath d='M17 17H3l4 4m-4-4l4-4'/%3E%3C/svg%3E\")",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              transform: rotated ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.35s ease",
            }}
          />
        </div>

        {/* FROM SELECTOR */}
        <div style={{ position: "relative" }}>
          <h3>FROM</h3>
          <div
            onClick={() =>
              setOpenDropdown(openDropdown === "from" ? null : "from")
            }
            className="selector-box"
          >
            {fromCoin && (
              <>
                <img className="selector-img" src={fromCoin.image} />
                <div>
                  <div className="selector-symbol">{fromCoin.symbol}</div>
                  <div className="selector-name">{fromCoin.name}</div>
                </div>
              </>
            )}
          </div>

          {openDropdown === "from" && (
            <div className="dropdown-panel" ref={panelRef}>
              <input
                className="dropdown-search"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {filtered.map((coin) => (
                <div
                  key={coin.id}
                  className="dropdown-row"
                  onClick={() => {
                    setFromCoin(coin);
                    setOpenDropdown(null);
                    setResult(null);
                  }}
                >
                  <img className="dropdown-flag" src={coin.image} />
                  {coin.symbol} — {coin.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TO SELECTOR */}
        <div style={{ position: "relative" }}>
          <h3>TO</h3>
          <div
            onClick={() => setOpenDropdown(openDropdown === "to" ? null : "to")}
            className="selector-box"
          >
            {toCoin && (
              <>
                <img className="selector-img" src={toCoin.image} />
                <div>
                  <div className="selector-symbol">{toCoin.symbol}</div>
                  <div className="selector-name">{toCoin.name}</div>
                </div>
              </>
            )}
          </div>

          {openDropdown === "to" && (
            <div className="dropdown-panel" ref={panelRef}>
              <input
                className="dropdown-search"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {filtered.map((coin) => (
                <div
                  key={coin.id}
                  className="dropdown-row"
                  onClick={() => {
                    setToCoin(coin);
                    setOpenDropdown(null);
                    setResult(null);
                  }}
                >
                  <img className="dropdown-flag" src={coin.image} />
                  {coin.symbol} — {coin.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- RESULT BLOCK ---------------- */}
      {renderResult()}

      {/* ---------------- RANGE BUTTONS ---------------- */}
      <RangeButtons />

      {/* ---------------- CHART CONTAINER ---------------- */}
      <div
        ref={chartContainerRef}
        style={{
          width: "100%",
          height: "380px",
          marginTop: "30px",
          border: "1px solid var(--card-border)",
          borderRadius: "12px",
          background: "var(--card-bg)",
        }}
      />

    </div>
  );
}
