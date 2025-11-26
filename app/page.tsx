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
  market_cap?: number; // crypto only
  type: "crypto" | "fiat";
}

/* -------------------------------------------------------------
   FIAT LIST (UPPERCASE ISO CODES)
   Sorted alphabetically by symbol later
------------------------------------------------------------- */
const FIAT_LIST: Coin[] = [
  { id: "EUR", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
  { id: "GBP", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
  { id: "AUD", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
  { id: "CAD", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
  { id: "JPY", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
  { id: "CHF", symbol: "CHF", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
  { id: "NZD", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
  { id: "SEK", symbol: "SEK", name: "Swedish Krona", image: "https://flagcdn.com/se.svg", type: "fiat" },
  { id: "NOK", symbol: "NOK", name: "Norwegian Krone", image: "https://flagcdn.com/no.svg", type: "fiat" },
  { id: "DKK", symbol: "DKK", name: "Danish Krone", image: "https://flagcdn.com/dk.svg", type: "fiat" },
  { id: "HKD", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
  { id: "SGD", symbol: "SGD", name: "Singapore Dollar", image: "https://flagcdn.com/sg.svg", type: "fiat" },
  { id: "CNY", symbol: "CNY", name: "Chinese Yuan", image: "https://flagcdn.com/cn.svg", type: "fiat" },
  { id: "INR", symbol: "INR", name: "Indian Rupee", image: "https://flagcdn.com/in.svg", type: "fiat" },
  { id: "MXN", symbol: "MXN", name: "Mexican Peso", image: "https://flagcdn.com/mx.svg", type: "fiat" },
  { id: "BRL", symbol: "BRL", name: "Brazilian Real", image: "https://flagcdn.com/br.svg", type: "fiat" },
  { id: "ZAR", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
  { id: "TRY", symbol: "TRY", name: "Turkish Lira", image: "https://flagcdn.com/tr.svg", type: "fiat" },
  { id: "RUB", symbol: "RUB", name: "Russian Ruble", image: "https://flagcdn.com/ru.svg", type: "fiat" },
];

/* -------------------------------------------------------------
   USD PINNED AT TOP (UPPERCASE)
------------------------------------------------------------- */
const USD_COIN: Coin = {
  id: "USD",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

/* -------------------------------------------------------------
   FETCH TOP 250 CRYPTOS FROM COINGECKO
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
    console.error("Error fetching top 250 cryptos:", err);
    return [];
  }
}

/* -------------------------------------------------------------
   MERGE LISTS:
   1. USD pinned
   2. Crypto by market cap
   3. Fiat alphabetical by symbol
------------------------------------------------------------- */
function buildFinalCoinList(cryptos: Coin[]): Coin[] {
  const sortedCrypto = [...cryptos].sort((a, b) =>
    (b.market_cap || 0) - (a.market_cap || 0)
  );

  const sortedFiat = [...FIAT_LIST].sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );

  return [USD_COIN, ...sortedCrypto, ...sortedFiat];
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

  const [openDropdown, setOpenDropdown] =
    useState<"from" | "to" | null>(null);

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);

  const [range, setRange] = useState("24H");
  const lastValidData = useRef<any[]>([]);

  const [theme, setTheme] = useState("light");

  // Chart & dropdown refs
  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------------------------------------------
     LOAD THEME FROM <html>
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
     LOAD CRYPTOS + BUILD FINAL LIST
     (cache for 24 hours)
------------------------------------------------------------- */
  useEffect(() => {
    async function loadCoins() {
      try {
        const cached = localStorage.getItem("coins_cache");
        const ts = localStorage.getItem("coins_cache_ts");
        const now = Date.now();

        if (cached && ts && now - Number(ts) < 24 * 60 * 60 * 1000) {
          setAllCoins(JSON.parse(cached));
        } else {
          const top250 = await fetchTop250();
          const finalList = buildFinalCoinList(top250);

          localStorage.setItem("coins_cache", JSON.stringify(finalList));
          localStorage.setItem("coins_cache_ts", now.toString());

          setAllCoins(finalList);
        }
      } catch (err) {
        console.error("Error loading coins:", err);
      } finally {
        setLoadingCoins(false);
      }
    }

    loadCoins();
  }, []);
  /* -------------------------------------------------------------
   FORCE DEFAULT SELECTION (BTC → USD)
   Run only once when allCoins is populated
------------------------------------------------------------- */
useEffect(() => {
  if (fromCoin || toCoin) return;   // already set
  if (allCoins.length === 0) return;

  const btc = allCoins.find((c) => c.id === "bitcoin");
  const usd = allCoins.find((c) => c.id === "USD");

  if (btc && usd) {
    setFromCoin(btc);
    setToCoin(usd);
    setAmount("1");
  }
}, [allCoins]);

  
  /* -------------------------------------------------------------
     CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
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
     Works for both fiat + crypto
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
     DROPDOWN ROW
     - Symbol above name
     - Logo left
     - Selected state
     - Disabled same-coin lockout
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

          // Close dropdown + reset search
          setOpenDropdown(null);
          setFromSearch("");
          setToSearch("");

          // Trigger conversion instantly
          if (type === "from") {
            if (coin && toCoin) fetchRate(coin, toCoin);
          } else {
            if (fromCoin && coin) fetchRate(fromCoin, coin);
          }
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
     DROPDOWN PANEL (search + list)
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
     FRANKFURTER — FETCH ALL FIAT FX RATES (USD → FIAT)
     Cached for 24 hours
  ------------------------------------------------------------- */
  const [fxRates, setFxRates] = useState<Record<string, number>>({});

  async function loadFxRates() {
    try {
      const cached = localStorage.getItem("fx_cache");
      const ts = localStorage.getItem("fx_cache_ts");
      const now = Date.now();

      if (cached && ts && now - Number(ts) < 24 * 60 * 60 * 1000) {
        setFxRates(JSON.parse(cached));
        return;
      }

      const res = await fetch("https://api.frankfurter.app/latest?from=USD");
      const data = await res.json();

      // store only the fiat we support
      const cleaned: Record<string, number> = {};
      for (const fiat of FIAT_LIST) {
        if (data.rates[fiat.id]) {
          cleaned[fiat.id] = data.rates[fiat.id];
        }
      }

      localStorage.setItem("fx_cache", JSON.stringify(cleaned));
      localStorage.setItem("fx_cache_ts", now.toString());

      setFxRates(cleaned);
    } catch (err) {
      console.error("FX rate fetch error:", err);
    }
  }

  useEffect(() => {
    loadFxRates();
  }, []);

  /* -------------------------------------------------------------
     GET USD VALUE OF ANY COIN (CRYPTO or FIAT)
     Returns: price of 1 coin in USD
  ------------------------------------------------------------- */
  async function getUsdValue(coin: Coin): Promise<number> {
    // CRYPTO → use CoinGecko price in USD
    if (coin.type === "crypto") {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        return data[coin.id]?.usd || 0;
      } catch (err) {
        console.error("Crypto USD fetch error:", err);
        return 0;
      }
    }

    // FIAT → use Frankfurter USD→FIAT rate
    if (coin.type === "fiat") {
      if (coin.id === "USD") return 1;

      const rate = fxRates[coin.id];
      if (!rate) return 0;

      // Frankfurter: USD→FIAT
      // To get 1 FIAT → USD
      return 1 / rate;
    }

    return 0;
  }

  /* -------------------------------------------------------------
     CONVERSION: CROSS-RATE USING USD NORMALIZATION
  ------------------------------------------------------------- */
  async function fetchRate(from: Coin, to: Coin) {
    try {
      const fromUSD = await getUsdValue(from);
      const toUSD = await getUsdValue(to);

      if (!fromUSD || !toUSD) return;

      const crossRate = fromUSD / toUSD;
      const numericAmount = Number(amount) || 0;

      setResult(crossRate * numericAmount);
    } catch (err) {
      console.error("Rate calculation error:", err);
    }
  }

  /* -------------------------------------------------------------
     RE-CALCULATE ON CHANGES
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    if (!fromCoin || !toCoin) return;
    if (Number(amount) <= 0) return;  // amount is already default "1"


    fetchRate(fromCoin, toCoin);
  }, [fromCoin, toCoin, amount, fxRates]);
  /* -------------------------------------------------------------
     RANGE → NUMBER OF DAYS
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
     FETCH USD PRICE HISTORY FOR CRYPTO
  ------------------------------------------------------------- */
  async function fetchCryptoHistoryUsd(coinId: string, days: number) {
    try {
      const url =
        `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.prices || data.prices.length === 0) return [];

      return data.prices.map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      }));
    } catch (err) {
      console.error("History USD fetch error:", err);
      return [];
    }
  }

  /* -------------------------------------------------------------
     BUILD CROSS-RATE HISTORY
     Convert all historical candles → FROM/TO cross-rate
  ------------------------------------------------------------- */
  async function buildCrossRateHistory(from: Coin, to: Coin, days: number) {
    // CRYPTO → CRYPTO
    if (from.type === "crypto" && to.type === "crypto") {
      const fromHistory = await fetchCryptoHistoryUsd(from.id, days);
      const toHistory = await fetchCryptoHistoryUsd(to.id, days);
      if (fromHistory.length === 0 || toHistory.length === 0) return [];

      return fromHistory.map((pt: any, i: number) => {
        const fromUSD = pt.value;
        const toUSD =
          toHistory[i]?.value || toHistory[toHistory.length - 1].value;
        return { time: pt.time, value: fromUSD / toUSD };
      });
    }

    // CRYPTO → FIAT
    if (from.type === "crypto" && to.type === "fiat") {
      const fromHistory = await fetchCryptoHistoryUsd(from.id, days);
      if (fromHistory.length === 0) return [];

      const usdToFiat = fxRates[to.id]; // USD→FIAT
      return fromHistory.map((pt: any) => ({
        time: pt.time,
        value: pt.value * usdToFiat,
      }));
    }

    // FIAT → CRYPTO
    if (from.type === "fiat" && to.type === "crypto") {
      const toHistory = await fetchCryptoHistoryUsd(to.id, days);
      if (toHistory.length === 0) return [];

      const fromUsd = 1 / fxRates[from.id];
      return toHistory.map((pt: any) => ({
        time: pt.time,
        value: fromUsd / pt.value,
      }));
    }

    // FIAT → FIAT (flat line)
    if (from.type === "fiat" && to.type === "fiat") {
      const fromUSD = 1 / fxRates[from.id];
      const toUSD = 1 / fxRates[to.id];
      const cross = fromUSD / toUSD;

      return [
        {
          time: Math.floor(Date.now() / 1000),
          value: cross,
        },
      ];
    }

    return [];
  }

  /* -------------------------------------------------------------
     CHART CREATION + UPDATING
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!fromCoin || !toCoin) return;
    // Only require FX rates when either coin is fiat
const needsFx =
  fromCoin?.type === "fiat" || toCoin?.type === "fiat";

if (needsFx && Object.keys(fxRates).length === 0) return;

    const container = chartContainerRef.current;
    container.innerHTML = "";

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
      topColor: isDark ? "rgba(78,161,247,0.45)" : "rgba(59,130,246,0.45)",
      bottomColor: "rgba(0,0,0,0)",
    });

    const days = rangeToDays(range);

    buildCrossRateHistory(fromCoin, toCoin, days).then((data) => {
      if (data.length > 0) {
        lastValidData.current = data;
        series.setData(data);
      } else {
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
     SWAP BUTTON — FIXED VERSION
  ------------------------------------------------------------- */
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;

    const oldFrom = fromCoin;
    const oldTo = toCoin;

    setFromCoin(oldTo);
    setToCoin(oldFrom);

    // Recalc instantly
    fetchRate(oldTo, oldFrom);
  };

  /* -------------------------------------------------------------
     RANGE BUTTONS
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
          {baseRate.toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
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
     FINAL JSX LAYOUT
  ------------------------------------------------------------- */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "28px" }}>
      
      {/* TOP INPUTS & SELECTORS */}
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
            <div className="selector-text">
              <div className="selector-symbol">{fromCoin?.symbol}</div>
              <div className="selector-name">{fromCoin?.name}</div>
            </div>
          </div>

          {openDropdown === "from" && renderDropdown("from")}
        </div>

        {/* SWAP BUTTON */}
        <div onClick={handleSwap} className="swap-circle" style={{ marginTop: "36px" }}>
          <div className="swap-icon" />
        </div>

        {/* TO SELECTOR */}
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
