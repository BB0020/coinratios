"use client";

import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

/* -------------------------------------------------------------
   TYPES
------------------------------------------------------------- */
type Coin = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
  market_cap?: number;
};

/* -------------------------------------------------------------
   STATE
------------------------------------------------------------- */
export default function Home() {
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);

  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [range, setRange] = useState("1M");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const lastValidData = useRef<any[]>([]);

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const [theme, setTheme] = useState<"light" | "dark">("light");

  /* -------------------------------------------------------------
     COIN LOADER (REPAIRED)
     - Loads top 250 crypto
     - Builds fiat list
     - USD pinned at top
     - Crypto sorted by market cap
     - Fiat sorted alphabetically
------------------------------------------------------------- */
useEffect(() => {
  async function loadCoins() {
    try {
      /* -------------------------------
         1. LOAD TOP 250 CRYPTOS
      ------------------------------- */
      const cryptoRes = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1"
      );

      const cryptoData = await cryptoRes.json();

      const cryptos: Coin[] = cryptoData.map((c: any) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        image: c.image,
        market_cap: c.market_cap,
        type: "crypto",
      }));

      /* -------------------------------
         2. BUILD FIAT LIST
      ------------------------------- */
      const fiatList: Coin[] = [
        {
          id: "USD",
          symbol: "USD",
          name: "US Dollar",
          image: "/flags/USD.png",
          type: "fiat",
        },
        {
          id: "EUR",
          symbol: "EUR",
          name: "Euro",
          image: "/flags/EUR.png",
          type: "fiat",
        },
        {
          id: "GBP",
          symbol: "GBP",
          name: "British Pound",
          image: "/flags/GBP.png",
          type: "fiat",
        },
        {
          id: "JPY",
          symbol: "JPY",
          name: "Japanese Yen",
          image: "/flags/JPY.png",
          type: "fiat",
        },
        {
          id: "CAD",
          symbol: "CAD",
          name: "Canadian Dollar",
          image: "/flags/CAD.png",
          type: "fiat",
        },
        {
          id: "AUD",
          symbol: "AUD",
          name: "Australian Dollar",
          image: "/flags/AUD.png",
          type: "fiat",
        },
      ];

      /* -------------------------------
         3. SORT COINS
      ------------------------------- */

      // USD must be first
      const usd = fiatList.find((c) => c.id === "USD")!;

      // Crypto sorted by market cap
      const cryptoSorted = cryptos
        .filter((c) => c.market_cap && c.image)
        .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));

      // Fiat sorted alphabetically (excluding USD)
      const fiatSorted = fiatList
        .filter((c) => c.id !== "USD")
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

      /* -------------------------------
         4. FINAL MIXED LIST
      ------------------------------- */
      const finalList: Coin[] = [
        usd,             // USD pinned
        ...cryptoSorted, // Crypto by MC
        ...fiatSorted,   // Fiat alphabetically
      ];

      setAllCoins(finalList);
    } catch (err) {
      console.error("Error loading coins:", err);
    }
  }

  loadCoins();
}, []);
/* -------------------------------------------------------------
   FORCE DEFAULT SELECTION — BTC → USD
   Runs once after allCoins is populated
------------------------------------------------------------- */
useEffect(() => {
  // Wait for coin list to load
  if (!allCoins || allCoins.length === 0) return;

  // If defaults already selected, do nothing
  if (fromCoin !== null || toCoin !== null) return;

  const btc = allCoins.find((c) => c.id.toLowerCase() === "bitcoin");
  const usd = allCoins.find((c) => c.id.toUpperCase() === "USD");

  if (btc && usd) {
    setFromCoin(btc);
    setToCoin(usd);
    setAmount("1");
  }
}, [allCoins]);


/* -------------------------------------------------------------
   LOAD FX RATES — FRANKFURTER.APP
   Cache for 24 hours to avoid rate limits
------------------------------------------------------------- */
useEffect(() => {
  async function loadFx() {
    // Check cached rates
    const cached = localStorage.getItem("fx_cache");
    const cachedTS = localStorage.getItem("fx_cache_ts");
    const now = Date.now();

    if (cached && cachedTS && now - Number(cachedTS) < 24 * 60 * 60 * 1000) {
      setFxRates(JSON.parse(cached));
      return;
    }

    try {
      const fxRes = await fetch("https://api.frankfurter.app/latest?from=USD");
      const fxData = await fxRes.json();
      const rates = fxData.rates || {};

      // Save to state + cache
      setFxRates(rates);
      localStorage.setItem("fx_cache", JSON.stringify(rates));
      localStorage.setItem("fx_cache_ts", String(Date.now()));
    } catch (err) {
      console.error("FX load error:", err);
    }
  }

  loadFx();
}, []);


/* -------------------------------------------------------------
   GET CRYPTO PRICE IN USD — CoinGecko
------------------------------------------------------------- */
async function fetchCryptoToUsd(coin: Coin): Promise<number | null> {
  if (coin.type !== "crypto") return null;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`;
    const res = await fetch(url);
    const data = await res.json();

    if (data[coin.id] && data[coin.id].usd) {
      return Number(data[coin.id].usd);
    }

    return null;
  } catch (err) {
    console.error("fetchCryptoToUsd error:", err);
    return null;
  }
}


/* -------------------------------------------------------------
   CORE CONVERSION LOGIC
   Handles ALL scenarios:
   1. crypto → crypto
   2. crypto → fiat
   3. fiat → crypto
   4. fiat → fiat
------------------------------------------------------------- */
async function fetchRate(from: Coin, to: Coin) {
  try {
    let fromUSD: number | null = null;
    let toUSD: number | null = null;

    /* ------------------------- */
    /*  CRYPTO → USD             */
    /* ------------------------- */
    if (from.type === "crypto") {
      fromUSD = await fetchCryptoToUsd(from);
    } else {
      // FIAT → USD
      const rate = fxRates[from.id];
      fromUSD = rate ? 1 / rate : null;
    }

    /* ------------------------- */
    /*  USD → CRYPTO             */
    /* ------------------------- */
    if (to.type === "crypto") {
      toUSD = await fetchCryptoToUsd(to);
    } else {
      // USD → FIAT
      const rate = fxRates[to.id];
      toUSD = rate ? rate : null;
    }

    if (fromUSD === null || toUSD === null) return;

    /*
      Cross-rate:
      fromCoin → USD → toCoin
    */
    const cross = fromUSD / toUSD;

    const finalValue = Number(amount) * cross;

    setResult(finalValue);
  } catch (err) {
    console.error("fetchRate error:", err);
  }
}


/* -------------------------------------------------------------
   TRIGGER CONVERSION WHENEVER INPUTS CHANGE
------------------------------------------------------------- */
useEffect(() => {
  if (!fromCoin || !toCoin) return;
  if (!amount || Number(amount) <= 0) return;

  // If converting crypto/fiat pairs, ensure FX rates loaded
  const needsFx =
    fromCoin.type === "fiat" || toCoin.type === "fiat";

  if (needsFx && Object.keys(fxRates).length === 0) return;

  fetchRate(fromCoin, toCoin);
}, [fromCoin, toCoin, amount, fxRates]);
/* -------------------------------------------------------------
   FILTER COINS FOR DROPDOWN (WITH SEARCH)
------------------------------------------------------------- */
function getFilteredCoins(type: "from" | "to") {
  const search = (type === "from" ? fromSearch : toSearch).toLowerCase();

  return allCoins.filter((coin) => {
    // prevent selecting same coin for both
    if (type === "from" && toCoin && coin.id === toCoin.id) return false;
    if (type === "to" && fromCoin && coin.id === fromCoin.id) return false;

    if (!search) return true;

    return (
      coin.name.toLowerCase().includes(search) ||
      coin.symbol.toLowerCase().includes(search)
    );
  });
}


/* -------------------------------------------------------------
   RENDER DROPDOWN ITEM
   - Symbol above name (Option A)
   - Disabled look for the opposite selected coin
   - Hover / active states included
------------------------------------------------------------- */
function DropdownItem({
  coin,
  onSelect,
  disabled,
  selected,
}: {
  coin: Coin;
  onSelect: (c: Coin) => void;
  disabled: boolean;
  selected: boolean;
}) {
  return (
    <div
      onClick={() => {
        if (!disabled) onSelect(coin);
      }}
      style={{
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        background: selected
          ? "var(--dropdown-selected-bg)"
          : "var(--card-bg)",
        borderBottom: "1px solid var(--card-border)",
        transition: "0.12s",
      }}
      onMouseEnter={(e) => {
        if (!selected && !disabled)
          (e.currentTarget.style.backgroundColor =
            "var(--dropdown-hover-bg)");
      }}
      onMouseLeave={(e) => {
        if (!selected)
          (e.currentTarget.style.backgroundColor =
            selected
              ? "var(--dropdown-selected-bg)"
              : "var(--card-bg)");
      }}
    >
      <img
        src={coin.image}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          objectFit: "cover",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* SYMBOL ABOVE NAME */}
        <span
          style={{
            fontSize: "15px",
            fontWeight: 700,
            textTransform: "uppercase",
            color: "var(--text)",
          }}
        >
          {coin.symbol}
        </span>
        <span
          style={{
            fontSize: "13px",
            opacity: 0.75,
            color: "var(--text)",
          }}
        >
          {coin.name}
        </span>
      </div>
    </div>
  );
}


/* -------------------------------------------------------------
   MAIN DROPDOWN RENDERER
   - Handles search input
   - Vertical scroll
   - Option A layout
   - Auto-close on selection
------------------------------------------------------------- */
function renderDropdown(type: "from" | "to") {
  const filtered = getFilteredCoins(type);
  const searchValue = type === "from" ? fromSearch : toSearch;
  const setSearch = type === "from" ? setFromSearch : setToSearch;

  const currentSelected = type === "from" ? fromCoin : toCoin;
  const setCurrent = type === "from" ? setFromCoin : setToCoin;

  return (
    <div
      style={{
        position: "absolute",
        top: "92px",
        width: "280px",
        maxHeight: "380px",
        overflowY: "auto",
        borderRadius: "12px",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        zIndex: 1000,
      }}
    >
      {/* Search box */}
      <input
        value={searchValue}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
        style={{
          width: "100%",
          padding: "12px",
          border: "none",
          borderBottom: "1px solid var(--card-border)",
          outline: "none",
          background: "var(--card-bg)",
          color: "var(--text)",
          fontSize: "15px",
        }}
      />

      {/* Coin list */}
      {filtered.map((coin) => {
        const disabled =
          type === "from"
            ? Boolean(toCoin && toCoin.id === coin.id)
            : Boolean(fromCoin && fromCoin.id === coin.id);

        const selected = currentSelected?.id === coin.id;

        return (
          <DropdownItem
            key={coin.id}
            coin={coin}
            disabled={disabled}
            selected={selected}
            onSelect={(c) => {
              setCurrent(c);
              setOpenDropdown(null);
              setSearch("");
            }}
          />
        );
      })}
    </div>
  );
}
/* -------------------------------------------------------------
   RANGE → NUMBER OF DAYS
   (Keeps chart always showing some meaningful history)
------------------------------------------------------------- */
function rangeToDays(r: string) {
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
    case "ALL":
      return 730; // 2 years
    default:
      return 30;
  }
}


/* -------------------------------------------------------------
   FETCH CRYPTO USD PRICE HISTORY (COINGECKO)
------------------------------------------------------------- */
async function fetchCryptoHistoryUsd(coinId: string, days: number) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.prices) return [];

    return data.prices.map((p: any) => ({
      time: Math.floor(p[0] / 1000),
      value: p[1],
    }));
  } catch (err) {
    console.error("fetchCryptoHistoryUsd error:", err);
    return [];
  }
}


/* -------------------------------------------------------------
   CROSS-RATE HISTORY BUILDER
   Handles:
   - crypto → crypto
   - crypto → fiat
   - fiat   → crypto
   - fiat   → fiat (flat line)
------------------------------------------------------------- */
async function buildCrossRateHistory(from: Coin, to: Coin, days: number) {
  /* -------------------------------
     CRYPTO → CRYPTO
  -------------------------------- */
  if (from.type === "crypto" && to.type === "crypto") {
    const fromHist = await fetchCryptoHistoryUsd(from.id, days);
    const toHist = await fetchCryptoHistoryUsd(to.id, days);

    if (!fromHist.length || !toHist.length) return [];

    return fromHist.map((pt: any, i: number) => {
      const fromUSD = pt.value;
      const toUSD =
        toHist[i]?.value || toHist[toHist.length - 1].value;

      return {
        time: pt.time,
        value: fromUSD / toUSD,
      };
    });
  }

  /* -------------------------------
     CRYPTO → FIAT
  -------------------------------- */
  if (from.type === "crypto" && to.type === "fiat") {
    const hist = await fetchCryptoHistoryUsd(from.id, days);
    const usdToFiat = fxRates[to.id]; // USD→FIAT

    if (!hist.length || !usdToFiat) return [];

    return hist.map((pt: any) => ({
      time: pt.time,
      value: pt.value * usdToFiat,
    }));
  }

  /* -------------------------------
     FIAT → CRYPTO
  -------------------------------- */
  if (from.type === "fiat" && to.type === "crypto") {
    const hist = await fetchCryptoHistoryUsd(to.id, days);

    const fromUsd = fxRates[from.id]
      ? 1 / fxRates[from.id]
      : null;

    if (!hist.length || !fromUsd) return [];

    return hist.map((pt: any) => ({
      time: pt.time,
      value: fromUsd / pt.value,
    }));
  }

  /* -------------------------------
     FIAT → FIAT
     Historical fiat→fiat data does NOT exist,
     so produce a flat line at the current cross-rate.
  -------------------------------- */
  if (from.type === "fiat" && to.type === "fiat") {
    const fromUsd = fxRates[from.id]
      ? 1 / fxRates[from.id]
      : null;
    const toUsd = fxRates[to.id]
      ? fxRates[to.id]
      : null;

    if (!fromUsd || !toUsd) return [];

    const cross = fromUsd / toUsd;
    const now = Math.floor(Date.now() / 1000);

    return [{ time: now, value: cross }];
  }

  return [];
}


/* -------------------------------------------------------------
   CHART SYSTEM
   Always loads data immediately on BTC→USD (defaults)
   Never goes blank when switching ranges
------------------------------------------------------------- */
useEffect(() => {
  if (!chartContainerRef.current) return;
  if (!fromCoin || !toCoin) return;

  // Only require FX when fiat involved
  const needsFx =
    fromCoin.type === "fiat" || toCoin.type === "fiat";

  if (needsFx && Object.keys(fxRates).length === 0) return;

  const container = chartContainerRef.current;
  container.innerHTML = "";

  const isDark = theme === "dark";

  const chart = createChart(container, {
    width: container.clientWidth,
    height: 360,
    layout: {
      background: { color: isDark ? "#1a1a1a" : "#ffffff" },
      textColor: isDark ? "#f1f1f1" : "#1a1a1a",
    },
    grid: {
      vertLines: { color: isDark ? "#2d2d2d" : "#e5e5e5" },
      horzLines: { color: isDark ? "#2d2d2d" : "#e5e5e5" },
    },
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
      borderVisible: false,
    },
  });

  const series = chart.addAreaSeries({
    lineColor: isDark ? "#4ea1f7" : "#3b82f6",
    topColor: isDark ? "rgba(78,161,247,0.45)" : "rgba(59,130,246,0.45)",
    bottomColor: "rgba(0,0,0,0)",
  });

  const days = rangeToDays(range);

  buildCrossRateHistory(fromCoin, toCoin, days).then((data) => {
    if (data.length > 0) {
      lastValidData.current = data;
      series.setData(data);
    } else {
      // fallback to last known valid data
      series.setData(lastValidData.current);
    }

    chart.timeScale().fitContent();
  });

  const handleResize = () => {
    chart.resize(container.clientWidth, 360);
    chart.timeScale().fitContent();
  };

  window.addEventListener("resize", handleResize);

  return () => {
    window.removeEventListener("resize", handleResize);
    chart.remove();
  };
}, [fromCoin, toCoin, range, theme, fxRates]);
/* -------------------------------------------------------------
   SWAP BUTTON — INSTANT RECALC + CHART UPDATE
------------------------------------------------------------- */
function handleSwap() {
  if (!fromCoin || !toCoin) return;

  const oldFrom = fromCoin;
  const oldTo = toCoin;

  setFromCoin(oldTo);
  setToCoin(oldFrom);
}


/* -------------------------------------------------------------
   RANGE BUTTONS (24H, 7D, 1M, etc.)
------------------------------------------------------------- */
function RangeButtons() {
  const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"];

  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "34px",
      }}
    >
      {ranges.map((r) => {
        const active = range === r;

        return (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: "10px 18px",
              margin: "0 6px",
              borderRadius: "999px",
              border: active
                ? "1px solid #3b82f6"
                : "1px solid var(--card-border)",
              background: active ? "#3b82f6" : "var(--card-bg)",
              color: active ? "#ffffff" : "var(--text)",
              boxShadow: active
                ? "0 0 7px rgba(59,130,246,0.45)"
                : "none",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 600,
              transition: "0.15s",
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}


/* -------------------------------------------------------------
   RESULT DISPLAY
------------------------------------------------------------- */
function renderResult() {
  if (!fromCoin || !toCoin) return null;
  if (result === null) return null;

  const baseRate = result / Number(amount);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      {/* 1 FROM → TO label */}
      <div style={{ fontSize: "22px", opacity: 0.7 }}>
        1 {fromCoin.symbol} → {toCoin.symbol}
      </div>

      {/* Main result */}
      <div
        style={{
          fontSize: "64px",
          fontWeight: 700,
          marginTop: "12px",
          lineHeight: "1.15",
          color: "var(--text)",
        }}
      >
        {result.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 8,
        })}{" "}
        {toCoin.symbol}
      </div>

      {/* Cross rates */}
      <div
        style={{
          opacity: 0.7,
          marginTop: "14px",
          fontSize: "20px",
          lineHeight: "1.6",
          color: "var(--text)",
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
}
/* -------------------------------------------------------------
   FINAL JSX LAYOUT
------------------------------------------------------------- */
return (
  <div
    style={{
      maxWidth: "1150px",
      margin: "0 auto",
      padding: "28px",
    }}
  >
    {/* ------------------------------------------- */}
    {/*   TOP ROW: AMOUNT | FROM | SWAP | TO        */}
    {/* ------------------------------------------- */}
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
        <h3 style={{ color: "var(--text)" }}>AMOUNT</h3>

        <input
          value={amount}
          inputMode="decimal"
          placeholder="1.00"
          onChange={(e) => {
            const v = e.target.value;
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

        {Number(amount) <= 0 && (
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

      {/* ---------------- FROM SELECT ---------------- */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <h3 style={{ color: "var(--text)" }}>FROM</h3>

        <div
          className="selector-box"
          onClick={() => {
            setOpenDropdown(openDropdown === "from" ? null : "from");
            setFromSearch("");
          }}
        >
          {fromCoin && (
            <>
              <img className="selector-img" src={fromCoin.image} />
              <div className="selector-text">
                <div className="selector-symbol">{fromCoin.symbol}</div>
                <div className="selector-name">{fromCoin.name}</div>
              </div>
            </>
          )}
        </div>

        {openDropdown === "from" && renderDropdown("from")}
      </div>

      {/* ---------------- SWAP BUTTON ---------------- */}
      <div
        onClick={handleSwap}
        className="swap-circle"
        style={{ marginTop: "36px" }}
      >
        <div className="swap-icon" />
      </div>

      {/* ---------------- TO SELECT ---------------- */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <h3 style={{ color: "var(--text)" }}>TO</h3>

        <div
          className="selector-box"
          onClick={() => {
            setOpenDropdown(openDropdown === "to" ? null : "to");
            setToSearch("");
          }}
        >
          {toCoin && (
            <>
              <img className="selector-img" src={toCoin.image} />
              <div className="selector-text">
                <div className="selector-symbol">{toCoin.symbol}</div>
                <div className="selector-name">{toCoin.name}</div>
              </div>
            </>
          )}
        </div>

        {openDropdown === "to" && renderDropdown("to")}
      </div>
    </div>

    {/* ------------------------------------------- */}
    {/*   RESULT BLOCK                              */}
    {/* ------------------------------------------- */}
    {renderResult()}

    {/* ------------------------------------------- */}
    {/*   RANGE BUTTONS                             */}
    {/* ------------------------------------------- */}
    <RangeButtons />

    {/* ------------------------------------------- */}
    {/*   CHART                                     */}
    {/* ------------------------------------------- */}
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
    />
  </div>
);
}
