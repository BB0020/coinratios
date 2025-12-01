"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";

// ------------------------------------------------------
// Types
// ------------------------------------------------------
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat" | "usd";
}

interface HistoryPoint {
  time: number;
  value: number;
}

// ------------------------------------------------------
// Component
// ------------------------------------------------------
export default function Page() {
  // ------------------------------------------------------
  // State
  // ------------------------------------------------------
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [amount, setAmount] = useState<string>("1");
  const [amountError, setAmountError] = useState(false);

  const [result, setResult] = useState<string>("");
  const [miniResult, setMiniResult] = useState<string>("");

  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [activeRange, setActiveRange] = useState("24H");

  // Chart references
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  // ------------------------------------------------------
  // Helper: Get full coin list (crypto + fiat + USD)
  // ------------------------------------------------------
  const loadCoins = useCallback(async () => {
    try {
      // Fetch cryptos from API
      const cryptoRes = await fetch("/api/coins");
      const cryptoJson = await cryptoRes.json();

      // Full global fiat list
      const fiats: Coin[] = [
        { id: "usd", symbol: "USD", name: "US Dollar", image: "https://flagsapi.com/US/flat/64.png", type: "usd" },

        { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagsapi.com/EU/flat/64.png", type: "fiat" },
        { id: "gbp", symbol: "GBP", name: "British Pound", image: "https://flagsapi.com/GB/flat/64.png", type: "fiat" },
        { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "https://flagsapi.com/CA/flat/64.png", type: "fiat" },
        { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "https://flagsapi.com/AU/flat/64.png", type: "fiat" },
        { id: "nzd", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagsapi.com/NZ/flat/64.png", type: "fiat" },
        { id: "chf", symbol: "CHF", name: "Swiss Franc", image: "https://flagsapi.com/CH/flat/64.png", type: "fiat" },
        { id: "jpy", symbol: "JPY", name: "Japanese Yen", image: "https://flagsapi.com/JP/flat/64.png", type: "fiat" },
        { id: "cny", symbol: "CNY", name: "Chinese Yuan", image: "https://flagsapi.com/CN/flat/64.png", type: "fiat" },
        { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagsapi.com/HK/flat/64.png", type: "fiat" },
        { id: "sgd", symbol: "SGD", name: "Singapore Dollar", image: "https://flagsapi.com/SG/flat/64.png", type: "fiat" },
        { id: "sek", symbol: "SEK", name: "Swedish Krona", image: "https://flagsapi.com/SE/flat/64.png", type: "fiat" },
        { id: "nok", symbol: "NOK", name: "Norwegian Krone", image: "https://flagsapi.com/NO/flat/64.png", type: "fiat" },
        { id: "dkk", symbol: "DKK", name: "Danish Krone", image: "https://flagsapi.com/DK/flat/64.png", type: "fiat" },

        { id: "mxn", symbol: "MXN", name: "Mexican Peso", image: "https://flagsapi.com/MX/flat/64.png", type: "fiat" },
        { id: "brl", symbol: "BRL", name: "Brazilian Real", image: "https://flagsapi.com/BR/flat/64.png", type: "fiat" },
        { id: "ars", symbol: "ARS", name: "Argentine Peso", image: "https://flagsapi.com/AR/flat/64.png", type: "fiat" },
        { id: "clp", symbol: "CLP", name: "Chilean Peso", image: "https://flagsapi.com/CL/flat/64.png", type: "fiat" },

        { id: "inr", symbol: "INR", name: "Indian Rupee", image: "https://flagsapi.com/IN/flat/64.png", type: "fiat" },
        { id: "php", symbol: "PHP", name: "Philippine Peso", image: "https://flagsapi.com/PH/flat/64.png", type: "fiat" },
        { id: "thb", symbol: "THB", name: "Thai Baht", image: "https://flagsapi.com/TH/flat/64.png", type: "fiat" },
        { id: "twd", symbol: "TWD", name: "Taiwan Dollar", image: "https://flagsapi.com/TW/flat/64.png", type: "fiat" },
        { id: "vnd", symbol: "VND", name: "Vietnamese Dong", image: "https://flagsapi.com/VN/flat/64.png", type: "fiat" },

        { id: "ils", symbol: "ILS", name: "Israeli Shekel", image: "https://flagsapi.com/IL/flat/64.png", type: "fiat" },
        { id: "sar", symbol: "SAR", name: "Saudi Riyal", image: "https://flagsapi.com/SA/flat/64.png", type: "fiat" },
        { id: "aed", symbol: "AED", name: "UAE Dirham", image: "https://flagsapi.com/AE/flat/64.png", type: "fiat" },
        { id: "qar", symbol: "QAR", name: "Qatari Riyal", image: "https://flagsapi.com/QA/flat/64.png", type: "fiat" },
        { id: "kwd", symbol: "KWD", name: "Kuwaiti Dinar", image: "https://flagsapi.com/KW/flat/64.png", type: "fiat" },

        { id: "zar", symbol: "ZAR", name: "South African Rand", image: "https://flagsapi.com/ZA/flat/64.png", type: "fiat" },
        { id: "ngn", symbol: "NGN", name: "Nigerian Naira", image: "https://flagsapi.com/NG/flat/64.png", type: "fiat" },
        { id: "egp", symbol: "EGP", name: "Egyptian Pound", image: "https://flagsapi.com/EG/flat/64.png", type: "fiat" },

        { id: "pln", symbol: "PLN", name: "Polish Złoty", image: "https://flagsapi.com/PL/flat/64.png", type: "fiat" },
        { id: "czk", symbol: "CZK", name: "Czech Koruna", image: "https://flagsapi.com/CZ/flat/64.png", type: "fiat" },
        { id: "huf", symbol: "HUF", name: "Hungarian Forint", image: "https://flagsapi.com/HU/flat/64.png", type: "fiat" },
        { id: "ron", symbol: "RON", name: "Romanian Leu", image: "https://flagsapi.com/RO/flat/64.png", type: "fiat" },

        { id: "try", symbol: "TRY", name: "Turkish Lira", image: "https://flagsapi.com/TR/flat/64.png", type: "fiat" },
      ];

      const merged = [...cryptoJson.cryptos, ...fiats];
      setAllCoins(merged);

      // Default: BTC → USD
      const btc = merged.find((c) => c.symbol === "BTC");
      const usd = merged.find((c) => c.symbol === "USD");

      if (btc) setFromCoin(btc);
      if (usd) setToCoin(usd);
    } catch (err) {
      console.error("LOAD COINS ERROR:", err);
    }
  }, []);

  // ------------------------------------------------------
  // Helper: Convert amount
  // ------------------------------------------------------
  const convert = useCallback(
    async (from: Coin, to: Coin, amt: number) => {
      try {
        // Get price of FROM in USD
        const fromRes = await fetch(
          `/api/price?id=${from.id}&type=${from.type}&symbol=${from.symbol}`
        );
        const fromJson = await fromRes.json();
        const fromUSD = fromJson.value;

        // Get price of TO in USD
        const toRes = await fetch(
          `/api/price?id=${to.id}&type=${to.type}&symbol=${to.symbol}`
        );
        const toJson = await toRes.json();
        const toUSD = toJson.value;

        if (fromUSD && toUSD) {
          const finalValue = (amt * fromUSD) / toUSD;

          setResult(
            finalValue.toLocaleString(undefined, {
              maximumFractionDigits: 8,
            })
          );

          setMiniResult(
            `1 ${from.symbol} = ${(fromUSD / toUSD).toLocaleString(undefined, {
              maximumFractionDigits: 8,
            })} ${to.symbol}`
          );
        }
      } catch (err) {
        console.error("CONVERT ERROR:", err);
      }
    },
    []
  );

  // ------------------------------------------------------
  // Helper: Load chart history
  // ------------------------------------------------------
  const loadHistory = useCallback(
    async (coin: Coin | null, range: string) => {
      if (!coin) return;

      const mapRange: any = {
        "24H": 1,
        "7D": 7,
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365,
        ALL: 0,
      };

      try {
        const r = await fetch(
          `/api/history?id=${coin.id}&type=${coin.type}&symbol=${coin.symbol}&days=${mapRange[range]}`
        );
        const json = await r.json();
        setHistoryData(json);
      } catch (err) {
        console.error("HISTORY ERROR:", err);
      }
    },
    []
  );

  // ------------------------------------------------------
  // Load coins on mount
  // ------------------------------------------------------
  useEffect(() => {
    loadCoins();
  }, [loadCoins]);
  // ------------------------------------------------------
  // Recalculate conversion whenever from/to/amount changes
  // ------------------------------------------------------
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    if (!amount || Number(amount) <= 0) {
      setAmountError(true);
      return;
    }
    setAmountError(false);

    convert(fromCoin, toCoin, Number(amount));
  }, [fromCoin, toCoin, amount, convert]);

  // ------------------------------------------------------
  // Swap FROM and TO coins
  // ------------------------------------------------------
  const swapCoins = () => {
    if (!fromCoin || !toCoin) return;
    const oldFrom = fromCoin;
    const oldTo = toCoin;
    setFromCoin(oldTo);
    setToCoin(oldFrom);
  };

  // ------------------------------------------------------
  // Load chart whenever FROM coin or range changes
  // ------------------------------------------------------
  useEffect(() => {
    if (!fromCoin) return;

    loadHistory(fromCoin, activeRange);
  }, [fromCoin, activeRange, loadHistory]);

  // ------------------------------------------------------
  // CHART INITIALIZATION (Create once)
  // ------------------------------------------------------
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const container = chartContainerRef.current;
    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 390,

      layout: {
        background: { color: isDark ? "#111111" : "#ffffff" },
        textColor: isDark ? "#eeeeee" : "#1a1a1a",
      },

      grid: {
        vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
      },

      rightPriceScale: {
        borderColor: isDark ? "#2a2a2a" : "#e3e3e3",
      },
      timeScale: {
        borderColor: isDark ? "#2a2a2a" : "#e3e3e3",
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark
        ? "rgba(78,161,247,0.35)"
        : "rgba(59,130,246,0.35)",
      bottomColor: "rgba(0,0,0,0)",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      chart.resize(container.clientWidth, 390);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // ------------------------------------------------------
  // Update chart data when new history data loads
  // ------------------------------------------------------
  useEffect(() => {
    if (!seriesRef.current || historyData.length === 0) return;
    seriesRef.current.setData(historyData);
    chartRef.current?.timeScale().fitContent();
  }, [historyData]);

  // ------------------------------------------------------
  // THEME CHANGE → CHART UPDATE
  // ------------------------------------------------------
  useEffect(() => {
    function applyTheme() {
      if (!chartRef.current || !seriesRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");

      chartRef.current.applyOptions({
        layout: {
          background: { color: isDark ? "#111111" : "#ffffff" },
          textColor: isDark ? "#eeeeee" : "#1a1a1a",
        },
        grid: {
          vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
          horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        },
        rightPriceScale: {
          borderColor: isDark ? "#2a2a2a" : "#e3e3e3",
        },
        timeScale: {
          borderColor: isDark ? "#2a2a2a" : "#e3e3e3",
        },
      });

      seriesRef.current.applyOptions({
        lineColor: isDark ? "#4ea1f7" : "#3b82f6",
        topColor: isDark
          ? "rgba(78,161,247,0.35)"
          : "rgba(59,130,246,0.35)",
        bottomColor: "rgba(0,0,0,0)",
      });
    }

    window.addEventListener("theme-change", applyTheme);
    return () => window.removeEventListener("theme-change", applyTheme);
  }, []);
  // ------------------------------------------------------
  // UI: Render
  // ------------------------------------------------------
  return (
    <div className="page-wrapper">
      {/* ===========================
          AMOUNT INPUT
      ============================ */}
      <div className="amount-box">
        <input
          type="number"
          step="any"
          value={amount}
          placeholder="Amount"
          onChange={(e) => setAmount(e.target.value)}
        />
        {amountError && (
          <div className="error-text">Enter a Number Greater than 0</div>
        )}
      </div>

      {/* ===========================
          FROM / TO SELECTORS + SWAP
      ============================ */}
      <div className="selectors-row">
        {/* FROM */}
        <div
          className="selector-box"
          onClick={() => {
            const menu = document.getElementById("from-menu");
            if (menu) menu.style.display = "block";
          }}
        >
          {fromCoin && (
            <>
              <img src={fromCoin.image} className="coin-img" />
              <span>{fromCoin.symbol}</span>
            </>
          )}
        </div>

        {/* SWAP */}
        <div className="swap-box" onClick={swapCoins}>
          <img
            src="/swap-arrow.png"
            alt="swap"
            className="swap-arrow"
          />
        </div>

        {/* TO */}
        <div
          className="selector-box"
          onClick={() => {
            const menu = document.getElementById("to-menu");
            if (menu) menu.style.display = "block";
          }}
        >
          {toCoin && (
            <>
              <img src={toCoin.image} className="coin-img" />
              <span>{toCoin.symbol}</span>
            </>
          )}
        </div>
      </div>

      {/* ===========================
          COIN SEARCH PANEL (FROM)
      ============================ */}
      <div id="from-menu" className="dropdown-panel">
        <div className="dropdown-search">
          <input
            type="text"
            placeholder="Search coin..."
            onChange={(e) => {
              const val = e.target.value.trim().toLowerCase();
              const items = document.querySelectorAll("#from-menu .dropdown-item");
              items.forEach((i) => {
                const txt = i.getAttribute("data-name") || "";
                (i as HTMLElement).style.display = txt.includes(val)
                  ? "flex"
                  : "none";
              });
            }}
          />
        </div>

        <div className="dropdown-list">
          {allCoins.map((c) => (
            <div
              key={c.id}
              className="dropdown-item"
              data-name={c.name.toLowerCase()}
              onClick={() => {
                setFromCoin(c);
                const menu = document.getElementById("from-menu");
                if (menu) menu.style.display = "none";
              }}
            >
              <img src={c.image} className="coin-img" />
              <span>{c.name}</span>
              <span className="symbol">{c.symbol}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===========================
          COIN SEARCH PANEL (TO)
      ============================ */}
      <div id="to-menu" className="dropdown-panel">
        <div className="dropdown-search">
          <input
            type="text"
            placeholder="Search coin..."
            onChange={(e) => {
              const val = e.target.value.trim().toLowerCase();
              const items = document.querySelectorAll("#to-menu .dropdown-item");
              items.forEach((i) => {
                const txt = i.getAttribute("data-name") || "";
                (i as HTMLElement).style.display = txt.includes(val)
                  ? "flex"
                  : "none";
              });
            }}
          />
        </div>

        <div className="dropdown-list">
          {allCoins.map((c) => (
            <div
              key={c.id}
              className="dropdown-item"
              data-name={c.name.toLowerCase()}
              onClick={() => {
                setToCoin(c);
                const menu = document.getElementById("to-menu");
                if (menu) menu.style.display = "none";
              }}
            >
              <img src={c.image} className="coin-img" />
              <span>{c.name}</span>
              <span className="symbol">{c.symbol}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ===========================
          CONVERSION RESULT
      ============================ */}
      <div className="result-box">
        {result ? (
          <>
            <div className="main-result">
              {amount} {fromCoin?.symbol} = {result} {toCoin?.symbol}
            </div>
            <div className="mini-result">{miniResult}</div>
          </>
        ) : (
          <div className="mini-result">0</div>
        )}
      </div>

      {/* ===========================
          CHART RANGE BUTTONS
      ============================ */}
      <div className="range-buttons">
        {["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"].map((r) => (
          <button
            key={r}
            className={activeRange === r ? "range-btn active" : "range-btn"}
            onClick={() => setActiveRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* ===========================
          CHART CONTAINER
      ============================ */}
      <div className="chart-wrapper">
        <div ref={chartContainerRef} className="chart-area"></div>
      </div>
    </div>
  );
} // <-- END OF COMPONENT
