"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { createChart, ColorType } from "lightweight-charts";

/* ------------------------------------------------------
   INTERFACES
------------------------------------------------------ */
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

interface PricePoint {
  time: number;   // UNIX seconds
  value: number;  // price in USD
}

/* ------------------------------------------------------
   FIAT CURRENCY LIST
------------------------------------------------------ */
const fiatList: Coin[] = [
  { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
  { id: "brl", symbol: "BRL", name: "Brazilian Real", image: "https://flagcdn.com/br.svg", type: "fiat" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
  { id: "chf", symbol: "CHF", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
  { id: "cny", symbol: "CNY", name: "Chinese Yuan", image: "https://flagcdn.com/cn.svg", type: "fiat" },
  { id: "dkk", symbol: "DKK", name: "Danish Krone", image: "https://flagcdn.com/dk.svg", type: "fiat" },
  { id: "eur", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
  { id: "gbp", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
  { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
  { id: "inr", symbol: "INR", name: "Indian Rupee", image: "https://flagcdn.com/in.svg", type: "fiat" },
  { id: "jpy", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
  { id: "krw", symbol: "KRW", name: "South Korean Won", image: "https://flagcdn.com/kr.svg", type: "fiat" },
  { id: "mxn", symbol: "MXN", name: "Mexican Peso", image: "https://flagcdn.com/mx.svg", type: "fiat" },
  { id: "nok", symbol: "NOK", name: "Norwegian Krone", image: "https://flagcdn.com/no.svg", type: "fiat" },
  { id: "nzd", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
  { id: "sek", symbol: "SEK", name: "Swedish Krona", image: "https://flagcdn.com/se.svg", type: "fiat" },
  { id: "sgd", symbol: "SGD", name: "Singapore Dollar", image: "https://flagcdn.com/sg.svg", type: "fiat" },
  { id: "try", symbol: "TRY", name: "Turkish Lira", image: "https://flagcdn.com/tr.svg", type: "fiat" },
  { id: "zar", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
];

const USD: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

/* ------------------------------------------------------
   PAGE COMPONENT
------------------------------------------------------ */
export default function Page() {

  /* ------------------------------------------------------
     STATE
  ------------------------------------------------------ */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);
  const [range, setRange] = useState("24H");

  /* ------------------------------------------------------
     REFS (Caches & Chart)
  ------------------------------------------------------ */
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const historyCache = useRef<Record<string, PricePoint[]>>({});
  const realtimeCache = useRef<Record<string, number>>({});

  const lastValidData = useRef<PricePoint[]>([]);

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------------------
     SWAP HANDLER
  ------------------------------------------------------ */
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;
    setFromCoin(toCoin);
    setToCoin(fromCoin);
  };

  /* ------------------------------------------------------
     LOAD CRYPTO LIST (ONCE)
  ------------------------------------------------------ */
  useEffect(() => {
    async function loadCoins() {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250"
      );
      const data = await res.json();

      const cryptos: Coin[] = data.map((c: any) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        image: c.image,
        type: "crypto",
      }));

      const sortedFiats = [...fiatList].sort((a, b) =>
        a.symbol.localeCompare(b.symbol)
      );

      const mixed = [...cryptos];
      for (const fiat of sortedFiats) {
        const idx = mixed.findIndex((coin) =>
          fiat.symbol.localeCompare(coin.symbol) < 0
        );
        if (idx === -1) mixed.push(fiat);
        else mixed.splice(idx, 0, fiat);
      }

      const finalList = [USD, ...mixed];
      setAllCoins(finalList);

      // Defaults
      setFromCoin(finalList.find((c) => c.id === "bitcoin") || finalList[1]);
      setToCoin(USD);
    }

    loadCoins();
  }, []);

  /* ------------------------------------------------------
     CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
  ------------------------------------------------------ */
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

  /* ------------------------------------------------------
     MEMOIZED FILTERED COIN LIST
  ------------------------------------------------------ */
  const filteredCoins = useCallback(
    (input: string) => {
      if (!input) return allCoins;
      const s = input.toLowerCase();
      return allCoins.filter(
        (c) =>
          c.symbol.toLowerCase().includes(s) ||
          c.name.toLowerCase().includes(s)
      );
    },
    [allCoins]
  );

  /* END CHUNK 1 */
  /* ------------------------------------------------------
     PRICE UTILITIES (USD BASELINE)
  ------------------------------------------------------ */

  /* Realtime crypto → USD, cached */
  const cryptoToUSD_now = useCallback(async (id: string) => {
    if (realtimeCache.current[id]) return realtimeCache.current[id];

    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const d = await r.json();

    const usd = d[id]?.usd ?? 0;
    realtimeCache.current[id] = usd;
    return usd;
  }, []);

  /* Realtime fiat → USD, cached (Frankfurter returns USD→FIAT so invert) */
  const fiatToUSD_now = useCallback(async (symbol: string) => {
    if (symbol === "USD") return 1;

    if (realtimeCache.current[symbol]) return realtimeCache.current[symbol];

    const r = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${symbol}`
    );
    const d = await r.json();
    const rate = d.rates?.[symbol] ?? 0;
    const inverted = 1 / rate;

    realtimeCache.current[symbol] = inverted;
    return inverted;
  }, []);

  /* Get universal realtime result using USD baseline */
  const computeResult = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setResult(null);
      return;
    }

    const [fromUSD, toUSD] = await Promise.all([
      fromCoin.type === "crypto"
        ? cryptoToUSD_now(fromCoin.id)
        : fiatToUSD_now(fromCoin.symbol),

      toCoin.type === "crypto"
        ? cryptoToUSD_now(toCoin.id)
        : fiatToUSD_now(toCoin.symbol),
    ]);

    const finalRate = fromUSD / toUSD;
    setResult(finalRate * amt);
  }, [fromCoin, toCoin, amount, cryptoToUSD_now, fiatToUSD_now]);

  /* Debounce realtime computation (avoid API spam while typing) */
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    const t = setTimeout(computeResult, 250);
    return () => clearTimeout(t);
  }, [fromCoin, toCoin, amount, computeResult]);

  /* ------------------------------------------------------
     RANGE → DAYS
  ------------------------------------------------------ */
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

  /* ------------------------------------------------------
     CRYPTO → USD HISTORY (from CoinGecko)
  ------------------------------------------------------ */
  const cryptoToUSD_history = useCallback(async (id: string, days: number) => {
    const key = `crypto-${id}-${days}`;
    if (historyCache.current[key]) return historyCache.current[key];

    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
    );
    const data = await res.json();

    const arr: PricePoint[] =
      data.prices?.map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1],
      })) ?? [];

    historyCache.current[key] = arr;
    return arr;
  }, []);

  /* ------------------------------------------------------
     FIAT → USD HISTORY (optimized to 1 API call)
  ------------------------------------------------------ */
  const fiatToUSD_history = useCallback(async (symbol: string, days: number) => {
    const key = `fiat-${symbol}-${days}`;
    if (historyCache.current[key]) return historyCache.current[key];

    // USD: flat line
    if (symbol === "USD") {
      const arr: PricePoint[] = [];
      const now = new Date();

      for (let i = 0; i < days; i++) {
        const t = new Date(now.getTime() - i * 86400000);
        arr.push({
          time: Math.floor(t.getTime() / 1000),
          value: 1,
        });
      }

      const sorted = arr.sort((a, b) => a.time - b.time);
      historyCache.current[key] = sorted;
      return sorted;
    }

    // Frankfurter RANGE API: YYYY-MM-DD..YYYY-MM-DD
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000);
    const startISO = start.toISOString().slice(0, 10);
    const endISO = now.toISOString().slice(0, 10);

    const url = `https://api.frankfurter.app/${startISO}..${endISO}?from=USD&to=${symbol}`;
    const r = await fetch(url);
    const data = await r.json();

    const out: PricePoint[] = Object.keys(data.rates).map((day) => {
      const usdToFiat = data.rates[day][symbol];
      return {
        time: Math.floor(new Date(day).getTime() / 1000),
        value: 1 / usdToFiat, // invert USD→FIAT to FIAT→USD
      };
    });

    const sorted = out.sort((a, b) => a.time - b.time);
    historyCache.current[key] = sorted;
    return sorted;
  }, []);

  /* ------------------------------------------------------
     MERGE HISTORY (Nearest timestamp matching)
  ------------------------------------------------------ */
  function mergeNearest(
    base: PricePoint[],
    other: PricePoint[],
    combine: (a: number, b: number) => number
  ) {
    const out: PricePoint[] = [];
    let j = 0;

    for (let i = 0; i < base.length; i++) {
      while (
        j < other.length - 1 &&
        Math.abs(other[j + 1].time - base[i].time) <
          Math.abs(other[j].time - base[i].time)
      ) {
        j++;
      }

      out.push({
        time: base[i].time,
        value: combine(base[i].value, other[j].value),
      });
    }

    return out;
  }

  /* ------------------------------------------------------
     UNIVERSAL HISTORY BUILDER WITH CACHING
  ------------------------------------------------------ */
  const computeHistory = useCallback(async () => {
    if (!fromCoin || !toCoin) return lastValidData.current;

    const days = rangeToDays(range);

    /* Parallel fetch */
    const [fromHist, toHist] = await Promise.all([
      fromCoin.type === "crypto"
        ? cryptoToUSD_history(fromCoin.id, days)
        : fiatToUSD_history(fromCoin.symbol, days),

      toCoin.type === "crypto"
        ? cryptoToUSD_history(toCoin.id, days)
        : fiatToUSD_history(toCoin.symbol, days),
    ]);

    if (!fromHist.length || !toHist.length) return lastValidData.current;

    const merged = mergeNearest(fromHist, toHist, (a, b) => a / b);
    lastValidData.current = merged;
    return merged;
  }, [fromCoin, toCoin, range, cryptoToUSD_history, fiatToUSD_history]);

  /* END CHUNK 2 */
  /* ------------------------------------------------------
     CHART INITIALIZATION (Create once)
  ------------------------------------------------------ */
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const container = chartContainerRef.current;
    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 390,
      layout: {
        background: { color: isDark ? "#111" : "#fff" },
        textColor: isDark ? "#eee" : "#1a1a1a",
      },
      grid: {
        vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
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

  /* ------------------------------------------------------
     APPLY DATA TO CHART (whenever range/from/to changes)
  ------------------------------------------------------ */
  useEffect(() => {
    async function updateChart() {
      if (!chartRef.current || !seriesRef.current) return;

      const data = await computeHistory();

      if (data.length) {
        seriesRef.current.setData(data);
      } else {
        seriesRef.current.setData(lastValidData.current);
      }

      chartRef.current.timeScale().fitContent();
    }

    updateChart();
  }, [computeHistory]);

  /* ------------------------------------------------------
     THEME CHANGE LISTENER FOR CHART
  ------------------------------------------------------ */
  useEffect(() => {
    function applyTheme() {
      if (!chartRef.current || !seriesRef.current) return;

      const isDark = document.documentElement.classList.contains("dark");

      chartRef.current.applyOptions({
        layout: {
          background: { color: isDark ? "#111" : "#fff" },
          textColor: isDark ? "#eee" : "#1a1a1a",
        },
        grid: {
          vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
          horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        },
      });

      seriesRef.current.applyOptions({
        lineColor: isDark ? "#4ea1f7" : "#3b82f6",
        topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
      });
    }

    // Trigger when ThemeToggle or layout button fires
    window.addEventListener("theme-change", applyTheme);
    return () => window.removeEventListener("theme-change", applyTheme);
  }, []);

  /* ------------------------------------------------------
     DROPDOWN RENDERING
  ------------------------------------------------------ */

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

  /* ------------------------------------------------------
     RESULT DISPLAY
  ------------------------------------------------------ */
  const renderResult = () => {
    if (!result || !fromCoin || !toCoin) return null;

    const baseRate = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "40px" }}>
        <div style={{ fontSize: "22px", opacity: 0.65 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div style={{ fontSize: "60px", fontWeight: 700, marginTop: "10px" }}>
          {result.toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
          {toCoin.symbol}
        </div>

        <div style={{ marginTop: "10px", opacity: 0.7 }}>
          1 {fromCoin.symbol} ={" "}
          {baseRate.toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
          {toCoin.symbol}
          <br />
          1 {toCoin.symbol} ={" "}
          {(1 / baseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
          {fromCoin.symbol}
        </div>
      </div>
    );
  };

  /* END CHUNK 3 */
  /* ------------------------------------------------------
     RANGE BUTTONS
  ------------------------------------------------------ */
  const RangeButtons = () => {
    const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y"];

    return (
      <div style={{ textAlign: "center", marginTop: "35px" }}>
        {ranges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={range === r ? "range-btn-active" : "range-btn"}
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
    );
  };

  /* ------------------------------------------------------
     PAGE RENDER
  ------------------------------------------------------ */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "24px" }}>
      
      {/* TOP AREA: AMOUNT, FROM, SWAP, TO */}
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
            className="amount-input"
            style={{
              width: "260px",
              padding: "14px 16px",
              borderRadius: "14px",
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              fontSize: "18px",
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
            <img src={fromCoin?.image} className="selector-img" />
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
          style={{ marginTop: "38px" }}
          className="swap-circle"
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
            <img src={toCoin?.image} className="selector-img" />
            <div>
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
          height: "400px",
          marginTop: "35px",
          borderRadius: "14px",
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
        }}
      ></div>
    </div>
  );
}
