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
// Coin List (expandable)
// ----------------------
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

// ----------------------
// Component
// ----------------------
export default function Page() {
  // ----------------------
  // UI State
  // ----------------------

  // Amount
  const [amount, setAmount] = useState("1");

  // Search text inside dropdown
  const [search, setSearch] = useState("");

  // Default FROM = BTC
  const [fromCoin, setFromCoin] = useState<Coin | null>(
    allCoins.find((c) => c.id === "bitcoin") || null
  );

  // Default TO = USD
  const [toCoin, setToCoin] = useState<Coin | null>(
    allCoins.find((c) => c.id === "usd") || null
  );

  // Dropdown search results
  const [filtered, setFiltered] = useState<Coin[]>(allCoins);

  // Which dropdown is open?
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  // Swap animation state
  const [rotated, setRotated] = useState(false);

  // Conversion result
  const [result, setResult] = useState<number | null>(null);

  // Controls "loading..." state for rate fetching
  const [loadingRate, setLoadingRate] = useState(false);

  // Chart range: 24H / 7D / 1M / 3M / 6M / 1Y / ALL
  const [range, setRange] = useState("24H");

  // Chart ref for lightweight-charts
  const chartRef = useRef<HTMLDivElement | null>(null);

  // Dropdown close detection
  const panelRef = useRef<HTMLDivElement | null>(null);
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
  // Swap coins
  // ----------------------
  const handleSwap = () => {
    if (fromCoin && toCoin) {
      setRotated(!rotated);
      const temp = fromCoin;
      setFromCoin(toCoin);
      setToCoin(temp);
      setResult(null); // force recalculation
    }
  };

  // ----------------------
  // Dropdown Search Filtering
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
  }, [search]);

  // ----------------------
  // Dropdown Panel Component
  // ----------------------
  const renderDropdown = (type: "from" | "to") => (
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
            if (type === "from") setFromCoin(coin);
            if (type === "to") setToCoin(coin);

            setOpenDropdown(null);
            setResult(null);
          }}
        >
          <img className="dropdown-flag" src={coin.image} />
          <span className="dropdown-symbol">{coin.symbol}</span>
          {coin.name}
        </div>
      ))}
    </div>
  );
  // ----------------------
  // Fetch conversion rate (CoinGecko)
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
      console.error("Price fetch error:", err);
    }

    setLoadingRate(false);
  };

  // ----------------------
  // Recalculate whenever fromCoin / toCoin / amount changes
  // ----------------------
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    if (isNaN(Number(amount)) || Number(amount) <= 0) return;

    fetchRate(fromCoin, toCoin);
  }, [fromCoin, toCoin, amount]);

  // ----------------------
  // Result Display Block (CoinGecko Style)
  // ----------------------
  const renderResult = () => {
    if (!fromCoin || !toCoin || result === null) return null;

    const baseRate = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "50px" }}>
        {/* Title */}
        <div style={{ fontSize: "22px", opacity: 0.7 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        {/* Main Result */}
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

        {/* Secondary ratios */}
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
  // ----------------------
  // Convert range into day counts
  // ----------------------
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

  // ----------------------
  // Fetch historical prices (CoinGecko market_chart)
  // ----------------------
  async function fetchHistory(id: string, vs: string, range: string) {
    try {
      const days = rangeToDays(range);
      const url =
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
        `?vs_currency=${vs}&days=${days}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.prices) return [];

      return data.prices.map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    } catch (err) {
      console.error("Historical fetch failed:", err);
      return [];
    }
  }

  // ----------------------
  // Chart container
  // ----------------------
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  // ----------------------
  // Build chart on load or when FROM/TO/RANGE changes
  // ----------------------
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!fromCoin || !toCoin) return;

    const isDark = document.documentElement.classList.contains("dark");

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
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

    // Area series (gradient line)
    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.40)" : "rgba(59,130,246,0.40)",
      bottomColor: "rgba(0,0,0,0)",
    });

    // Load data
    fetchHistory(fromCoin.id, toCoin.id, range).then((data) => {
      series.setData(data);
    });

    // Resize on window change
    const handleResize = () =>
      chart.resize(chartContainerRef.current!.clientWidth, 360);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [fromCoin, toCoin, range]);

  // ----------------------
  // Rebuild chart when theme changes
  // ----------------------
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setRange((r) => r); // re-trigger chart build
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  // ----------------------
  // Range selection buttons
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
              transition: "0.15s",
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
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "28px" }}>
      
      {/* PAGE TITLE (Optional, you can remove or edit) */}
      <h2 style={{ textAlign: "center", marginBottom: "10px" }}>
        Crypto Conversion & Historical Chart
      </h2>

      {/* ---------------------- TOP FLEX ROW ---------------------- */}
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
        {/* ---------------- AMOUNT ---------------- */}
        <div style={{ display: "flex", flexDirection: "column" }}>
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
              fontSize: "18px",
            }}
          />
        </div>

        {/* ---------------- FROM ---------------- */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h3>FROM</h3>

          <div
            className="selector-box"
            style={{ width: "260px", minHeight: "52px" }}
            onClick={() => {
              setOpenDropdown(openDropdown === "from" ? null : "from");
              setSearch("");
            }}
          >
            {fromCoin ? (
              <>
                <img className="selector-img" src={fromCoin.image} />
                <div>
                  <div className="selector-symbol">{fromCoin.symbol}</div>
                  <div className="selector-name">{fromCoin.name}</div>
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.5 }}>Select coin…</div>
            )}
          </div>

          {/* Dropdown */}
          {openDropdown === "from" && renderDropdown("from")}
        </div>

        {/* ---------------- SWAP BUTTON ---------------- */}
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
            marginTop: "36px",
          }}
        >
          <div
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

        {/* ---------------- TO ---------------- */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h3>TO</h3>

          <div
            className="selector-box"
            style={{ width: "260px", minHeight: "52px" }}
            onClick={() => {
              setOpenDropdown(openDropdown === "to" ? null : "to");
              setSearch("");
            }}
          >
            {toCoin ? (
              <>
                <img className="selector-img" src={toCoin.image} />
                <div>
                  <div className="selector-symbol">{toCoin.symbol}</div>
                  <div className="selector-name">{toCoin.name}</div>
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.5 }}>Select coin…</div>
            )}
          </div>

          {/* Dropdown */}
          {openDropdown === "to" && renderDropdown("to")}
        </div>
      </div>

      {/* ---------------------- CONVERSION RESULT ---------------------- */}
      {renderResult()}

      {/* ---------------------- RANGE BUTTONS ---------------------- */}
      <RangeButtons />

      {/* ---------------------- CHART CONTAINER ---------------------- */}
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
