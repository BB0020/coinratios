"use client";

import { useEffect, useState, useRef } from "react";
import { createChart } from "lightweight-charts";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
  market_cap?: number;
}

const [allCoins, setAllCoins] = useState<Coin[]>([]);

useEffect(() => {
  async function loadCoins() {
    try {
      // -------------------------
      // 1. Load Top 250 Cryptos
      // -------------------------
      const cryptoRes = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false"
      );

      const cryptoData = await cryptoRes.json();

      const cryptoList: Coin[] = cryptoData.map((c: any) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        image: c.image,
        type: "crypto",
        market_cap: c.market_cap,
      }));

      // Sort cryptos by market cap
      cryptoList.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));

      // -------------------------
      // 2. Add 20 Fiat Currencies
      // -------------------------
      const fiatList: Coin[] = [
        { id: "usd", symbol: "USD", name: "US Dollar", image: "https://flagcdn.com/us.svg", type: "fiat" },
        { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
        { id: "jpy", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
        { id: "gbp", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
        { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
        { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
        { id: "chf", symbol: "CHF", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
        { id: "cny", symbol: "CNY", name: "Chinese Yuan", image: "https://flagcdn.com/cn.svg", type: "fiat" },
        { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
        { id: "nzd", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
        { id: "sgd", symbol: "SGD", name: "Singapore Dollar", image: "https://flagcdn.com/sg.svg", type: "fiat" },
        { id: "sek", symbol: "SEK", name: "Swedish Krona", image: "https://flagcdn.com/se.svg", type: "fiat" },
        { id: "krw", symbol: "KRW", name: "South Korean Won", image: "https://flagcdn.com/kr.svg", type: "fiat" },
        { id: "nok", symbol: "NOK", name: "Norwegian Krone", image: "https://flagcdn.com/no.svg", type: "fiat" },
        { id: "mxn", symbol: "MXN", name: "Mexican Peso", image: "https://flagcdn.com/mx.svg", type: "fiat" },
        { id: "inr", symbol: "INR", name: "Indian Rupee", image: "https://flagcdn.com/in.svg", type: "fiat" },
        { id: "rub", symbol: "RUB", name: "Russian Ruble", image: "https://flagcdn.com/ru.svg", type: "fiat" },
        { id: "brl", symbol: "BRL", name: "Brazilian Real", image: "https://flagcdn.com/br.svg", type: "fiat" },
        { id: "zar", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
      ];

      // Keep USD first — alphabetize the remaining fiat
      const usdFiat = fiatList.find((f) => f.symbol === "USD")!;
      const otherFiats = fiatList.filter((f) => f.symbol !== "USD");
      otherFiats.sort((a, b) => a.symbol.localeCompare(b.symbol));

      // -------------------------
      // 3. Combine final list
      // -------------------------
      const finalList = [usdFiat, ...cryptoList, ...otherFiats];

      setAllCoins(finalList);

    } catch (err) {
      console.error("Error loading coins:", err);
    }
  }

  loadCoins();
}, []);



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
    // Case 1: crypto → crypto or crypto → fiat (OK on CoinGecko)
    if (from.type === "crypto") {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=${to.id}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data[from.id] && data[from.id][to.id]) {
        setResult(data[from.id][to.id] * Number(amount));
        return;
      }
    }

    // Case 2: fiat → crypto (not supported by CoinGecko)
    // Convert fiat → USD → crypto
    if (from.type === "fiat" && to.type === "crypto") {
      const fx = await fetch(`https://api.frankfurter.app/latest?from=${from.symbol}`);
      const fxData = await fx.json();
      const rateToUSD = fxData.rates["USD"];

      const cg = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`);
      const cgData = await cg.json();
      const toUsd = cgData[to.id].usd;

      const finalRate = (1 / rateToUSD) / toUsd;

      setResult(finalRate * Number(amount));
      return;
    }

    // Case 3: crypto → fiat (also safe via Frankfurter)
    if (from.type === "crypto" && to.type === "fiat") {
      const cg = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`);
      const cgData = await cg.json();
      const fromUsd = cgData[from.id].usd;

      const fx = await fetch(`https://api.frankfurter.app/latest?from=USD`);
      const fxData = await fx.json();
      const usdToFiat = fxData.rates[to.symbol];

      const finalRate = fromUsd * usdToFiat;

      setResult(finalRate * Number(amount));
      return;
    }

    // Case 4: fiat → fiat (Frankfurter supports it directly)
    if (from.type === "fiat" && to.type === "fiat") {
      const fx = await fetch(`https://api.frankfurter.app/latest?from=${from.symbol}&to=${to.symbol}`);
      const fxData = await fx.json();
      const finalRate = fxData.rates[to.symbol];

      setResult(finalRate * Number(amount));
      return;
    }
  } catch (err) {
    console.error("fetchRate error:", err);
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
