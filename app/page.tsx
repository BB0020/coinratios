"use client";

import { useEffect, useState, useRef } from "react";
import { createChart } from "lightweight-charts";

/* -------------------------------------------------------------
   TYPES
------------------------------------------------------------- */
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap?: number; // only for crypto
  type: "crypto" | "fiat";
}

/* -------------------------------------------------------------
   FIAT LIST (20 TOTAL)
   - USD is pinned separately later
   - All others will be alphabetized
------------------------------------------------------------- */
const FIAT_LIST: Coin[] = [
  { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
  { id: "gbp", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
  { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
  { id: "jpy", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
  { id: "chf", symbol: "CHF", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
  { id: "nzd", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
  { id: "sek", symbol: "SEK", name: "Swedish Krona", image: "https://flagcdn.com/se.svg", type: "fiat" },
  { id: "nok", symbol: "NOK", name: "Norwegian Krone", image: "https://flagcdn.com/no.svg", type: "fiat" },
  { id: "dkk", symbol: "DKK", name: "Danish Krone", image: "https://flagcdn.com/dk.svg", type: "fiat" },
  { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
  { id: "sgd", symbol: "SGD", name: "Singapore Dollar", image: "https://flagcdn.com/sg.svg", type: "fiat" },
  { id: "cny", symbol: "CNY", name: "Chinese Yuan", image: "https://flagcdn.com/cn.svg", type: "fiat" },
  { id: "inr", symbol: "INR", name: "Indian Rupee", image: "https://flagcdn.com/in.svg", type: "fiat" },
  { id: "mxn", symbol: "MXN", name: "Mexican Peso", image: "https://flagcdn.com/mx.svg", type: "fiat" },
  { id: "brl", symbol: "BRL", name: "Brazilian Real", image: "https://flagcdn.com/br.svg", type: "fiat" },
  { id: "zar", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
  { id: "try", symbol: "TRY", name: "Turkish Lira", image: "https://flagcdn.com/tr.svg", type: "fiat" },
  { id: "rub", symbol: "RUB", name: "Russian Ruble", image: "https://flagcdn.com/ru.svg", type: "fiat" },
];

/* -------------------------------------------------------------
   USD PINNED SEPARATELY
------------------------------------------------------------- */
const USD_COIN: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

/* -------------------------------------------------------------
   COINGECKO FETCHER FOR TOP 250 CRYPTOS
------------------------------------------------------------- */
async function fetchTop250(): Promise<Coin[]> {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets" +
      "?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false";

    const res = await fetch(url);
    const cryptos = await res.json();

    return cryptos.map((c: any) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      market_cap: c.market_cap,
      type: "crypto",
    }));
  } catch (err) {
    console.error("Error fetching top 250:", err);
    return [];
  }
}

/* -------------------------------------------------------------
   MERGE LIST → USD pinned → Fiat alphabetical → Crypto by market cap
------------------------------------------------------------- */
function buildFinalCoinList(crypto: Coin[]): Coin[] {
  // Sort fiat (excluding USD) alphabetically
  const sortedFiat = [...FIAT_LIST].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Sort crypto by market cap DESC
  const sortedCrypto = [...crypto].sort((a, b) =>
    (b.market_cap || 0) - (a.market_cap || 0)
  );

  return [USD_COIN, ...sortedFiat, ...sortedCrypto];
}

export default function Page() {
  /* -------------------------------------------------------------
     STATE
  ------------------------------------------------------------- */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [loadingCoins, setLoadingCoins] = useState(true);

  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const [range, setRange] = useState("24H");
  const lastValidData = useRef<any[]>([]);

  const [theme, setTheme] = useState("light");

  /* -------------------------------------------------------------
     LOAD THEME FROM <html> WHEN CHANGED
  ------------------------------------------------------------- */
  useEffect(() => {
    const apply = () => {
      const cls = document.documentElement.className;
      setTheme(cls === "dark" ? "dark" : "light");
    };

    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true });

    return () => obs.disconnect();
  }, []);

  /* -------------------------------------------------------------
     FETCH + CACHE ALL COINS (24h)
------------------------------------------------------------- */
  useEffect(() => {
    async function loadCoins() {
      try {
        const cached = localStorage.getItem("coins_cache");
        const ts = localStorage.getItem("coins_cache_ts");
        const now = Date.now();

        if (cached && ts && now - Number(ts) < 24 * 60 * 60 * 1000) {
          const parsed = JSON.parse(cached);
          setAllCoins(parsed);
        } else {
          const top250 = await fetchTop250();
          const finalList = buildFinalCoinList(top250);

          localStorage.setItem("coins_cache", JSON.stringify(finalList));
          localStorage.setItem("coins_cache_ts", now.toString());

          setAllCoins(finalList);
        }
      } catch (err) {
        console.error("Coin list error:", err);
      } finally {
        setLoadingCoins(false);
      }
    }

    loadCoins();
  }, []);
  /* -------------------------------------------------------------
     CLOSE DROPDOWNS ON OUTSIDE CLICK
  ------------------------------------------------------------- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openDropdown === "from") {
        if (
          fromPanelRef.current &&
          !fromPanelRef.current.contains(e.target as Node)
        ) {
          setOpenDropdown(null);
          setFromSearch("");
        }
      }

      if (openDropdown === "to") {
        if (
          toPanelRef.current &&
          !toPanelRef.current.contains(e.target as Node)
        ) {
          setOpenDropdown(null);
          setToSearch("");
        }
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  /* -------------------------------------------------------------
     SEARCH FILTER
  ------------------------------------------------------------- */
  const filteredCoins = (search: string) => {
    if (!search) return allCoins;
    const s = search.toLowerCase();

    return allCoins.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.symbol.toLowerCase().includes(s)
    );
  };

  /* -------------------------------------------------------------
     DROPDOWN ROW COMPONENT
     - Symbol above name
     - Logo left
     - Selected highlight
     - Disabled logic
  ------------------------------------------------------------- */
  const renderRow = (coin: Coin, type: "from" | "to") => {
    const isDisabled =
      (type === "from" && coin.id === toCoin?.id) ||
      (type === "to" && coin.id === fromCoin?.id);

    const isSelected =
      (type === "from" && coin.id === fromCoin?.id) ||
      (type === "to" && coin.id === toCoin?.id);

    let cls = "dropdown-row";
    if (isSelected) cls += " dropdown-selected";
    if (isDisabled) cls += " dropdown-disabled";

    return (
      <div
        key={coin.id}
        className={cls}
        onClick={() => {
          if (isDisabled) return;

          if (type === "from") setFromCoin(coin);
          if (type === "to") setToCoin(coin);

          setOpenDropdown(null);
          setFromSearch("");
          setToSearch("");

          // Instant refresh
          const newFrom = type === "from" ? coin : fromCoin!;
          const newTo = type === "to" ? coin : toCoin!;
          fetchRate(newFrom, newTo);
        }}
      >
        <img className="dropdown-flag" src={coin.image} />

        <div className="dropdown-text">
          <span className="dropdown-symbol">{coin.symbol}</span>
          <span className="dropdown-name">{coin.name}</span>
        </div>
      </div>
    );
  };

  /* -------------------------------------------------------------
     DROPDOWN PANEL (Search + Scroll + Rows)
  ------------------------------------------------------------- */
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

        {filteredCoins(search).map((coin) => renderRow(coin, type))}
      </div>
    );
  };

  /* -------------------------------------------------------------
     FETCH CONVERSION RATE
  ------------------------------------------------------------- */
  async function fetchRate(from: Coin, to: Coin) {
    try {
      const url =
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=${to.id}`;
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

  /* -------------------------------------------------------------
     RE-CALCULATE ON FROM/TO/AMOUNT CHANGE
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    if (amount === "" || Number(amount) <= 0) return;

    fetchRate(fromCoin, toCoin);
  }, [fromCoin, toCoin, amount]);

  /* -------------------------------------------------------------
     SWAP BUTTON HANDLER
  ------------------------------------------------------------- */
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;

    const prevFrom = fromCoin;
    const prevTo = toCoin;

    setFromCoin(prevTo);
    setToCoin(prevFrom);

    // Instant update
    fetchRate(prevTo, prevFrom);
  };
  /* -------------------------------------------------------------
     RANGE → DAYS MAPPING
  ------------------------------------------------------------- */
  function rangeToDays(range: string) {
    switch (range) {
      case "24H": return 1;
      case "7D": return 7;
      case "1M": return 30;
      case "3M": return 90;
      case "6M": return 180;
      case "1Y": return 365;
      case "ALL": return 730; // 2 years
      default: return 30;
    }
  }

  /* -------------------------------------------------------------
     HISTORICAL PRICE FETCHER
  ------------------------------------------------------------- */
  async function fetchHistory(id: string, vs: string, r: string) {
    const days = rangeToDays(r);

    const url =
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart` +
      `?vs_currency=${vs}&days=${days}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!data.prices || data.prices.length === 0) return [];

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
     CHART CREATION + REBUILD
     - Runs on: fromCoin, toCoin, range, theme
     - NEVER blank (uses lastValidData as fallback)
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!fromCoin || !toCoin) return;

    const container = chartContainerRef.current;

    // Clear old chart
    container.innerHTML = "";

    const isDark = theme === "dark";

    /* -----------------------------
       Create chart
    ----------------------------- */
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

    /* -----------------------------
       Create series
    ----------------------------- */
    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark
        ? "rgba(78,161,247,0.40)"
        : "rgba(59,130,246,0.40)",
      bottomColor: "rgba(0,0,0,0)",
    });

    /* -----------------------------
       Load fresh history
    ----------------------------- */
    fetchHistory(fromCoin.id, toCoin.id, range).then((data) => {
      if (data.length > 0) {
        lastValidData.current = data;
        series.setData(data);
      } else {
        // fallback: never blank
        series.setData(lastValidData.current);
      }

      chart.timeScale().fitContent();
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
     RANGE BUTTONS (UI + logic)
  ------------------------------------------------------------- */
  const RangeButtons = () => {
    const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"];

    return (
      <div style={{ textAlign: "center", marginTop: "34px" }}>
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
              color: range === r ? "#ffffff" : "var(--text)",
              boxShadow:
                range === r ? "0 0 7px rgba(59,130,246,0.45)" : "none",
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
     RESULT DISPLAY
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
     MAIN JSX LAYOUT
  ------------------------------------------------------------- */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "28px" }}>
      {/* TOP FLEX ROW */}
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
        {/* AMOUNT INPUT */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h3>AMOUNT</h3>

          <input
            value={amount}
            placeholder="0.00"
            inputMode="decimal"
            onChange={(e) => {
              const v = e.target.value;
              // numbers + decimals only
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                setAmount(v);
              }
            }}
            style={{
              width: "220px",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              fontSize: "18px",
              color: "var(--text)",
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

        {/* FROM SELECTOR */}
        <div
          style={{ display: "flex", flexDirection: "column", position: "relative" }}
        >
          <h3>FROM</h3>

          <div
            className="selector-box"
            onClick={() => {
              setOpenDropdown(openDropdown === "from" ? null : "from");
              setFromSearch("");
            }}
          >
            <img className="selector-img" src={fromCoin?.image} />
            <div className="selector-text">
              <div className="selector-symbol">{fromCoin?.symbol}</div>
              <div className="selector-name">{fromCoin?.name}</div>
            </div>
          </div>

          {openDropdown === "from" && renderDropdown("from")}
        </div>

        {/* SWAP BUTTON */}
        <div
          onClick={handleSwap}
          className="swap-circle"
          style={{ marginTop: "36px" }}
        >
          <div className="swap-icon" />
        </div>

        {/* TO SELECTOR */}
        <div
          style={{ display: "flex", flexDirection: "column", position: "relative" }}
        >
          <h3>TO</h3>

          <div
            className="selector-box"
            onClick={() => {
              setOpenDropdown(openDropdown === "to" ? null : "to");
              setToSearch("");
            }}
          >
            <img className="selector-img" src={toCoin?.image} />
            <div className="selector-text">
              <div className="selector-symbol">{toCoin?.symbol}</div>
              <div className="selector-name">{toCoin?.name}</div>
            </div>
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
