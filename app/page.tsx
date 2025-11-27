"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, UTCTimestamp } from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

/* ===========================================================
      TYPES
=========================================================== */
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  type: "crypto" | "fiat";
}

interface HistoryPoint {
  time: UTCTimestamp;
  value: number;
}

/* ===========================================================
      FIAT LIST
=========================================================== */
const fiatList: Coin[] = [
  { id: "USD", symbol: "USD", name: "US Dollar", type: "fiat" },
  { id: "EUR", symbol: "EUR", name: "Euro", type: "fiat" },
  { id: "JPY", symbol: "JPY", name: "Japanese Yen", type: "fiat" },
  { id: "GBP", symbol: "GBP", name: "British Pound", type: "fiat" },
  { id: "AUD", symbol: "AUD", name: "Australian Dollar", type: "fiat" },
  { id: "CAD", symbol: "CAD", name: "Canadian Dollar", type: "fiat" },
  { id: "CHF", symbol: "CHF", name: "Swiss Franc", type: "fiat" },
  { id: "CNY", symbol: "CNY", name: "Chinese Yuan", type: "fiat" },
  { id: "HKD", symbol: "HKD", name: "Hong Kong Dollar", type: "fiat" },
  { id: "NZD", symbol: "NZD", name: "New Zealand Dollar", type: "fiat" },
  { id: "SEK", symbol: "SEK", name: "Swedish Krona", type: "fiat" },
  { id: "KRW", symbol: "KRW", name: "South Korean Won", type: "fiat" },
  { id: "SGD", symbol: "SGD", name: "Singapore Dollar", type: "fiat" },
  { id: "NOK", symbol: "NOK", name: "Norwegian Krone", type: "fiat" },
  { id: "MXN", symbol: "MXN", name: "Mexican Peso", type: "fiat" },
  { id: "INR", symbol: "INR", name: "Indian Rupee", type: "fiat" },
  { id: "BRL", symbol: "BRL", name: "Brazilian Real", type: "fiat" },
  { id: "ZAR", symbol: "ZAR", name: "South African Rand", type: "fiat" },
  { id: "RUB", symbol: "RUB", name: "Russian Ruble", type: "fiat" },
  { id: "TRY", symbol: "TRY", name: "Turkish Lira", type: "fiat" },
];

const USD = { id: "USD", symbol: "USD", name: "US Dollar", type: "fiat" };

/* ===========================================================
      CACHES (NEW)
=========================================================== */
const cryptoHistoryCache: Record<string, HistoryPoint[]> = {};
const fiatHistoryCache: Record<string, HistoryPoint[]> = {};
const cryptoNowCache: Record<string, number> = {};
const fiatNowCache: Record<string, number> = {};

/* ===========================================================
      PAGE COMPONENT
=========================================================== */
export default function Page() {
  /* ------------------------------
        STATE
  ------------------------------ */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [amount, setAmount] = useState("1");
  const [range, setRange] = useState("24H");
  const [theme, setTheme] = useState("light");
  const [result, setResult] = useState<number | null>(null);

  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const lastValidData = useRef<HistoryPoint[]>([]);

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  /* ===========================================================
        WATCH THEME
  ============================================================ */
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.className);
    });
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  /* ------------------------------
      LOAD COINS + INSERT FIAT
------------------------------ */
useEffect(() => {
  async function loadCoins() {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
    );
    const data = await res.json();

    // FIXED: ensure crypto objects strictly match interface Coin
    const cryptos: Coin[] = data.map((c: any) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      type: "crypto",   // <— MUST BE EXACT STRING LITERAL
    }));

    // Sort fiat list
    const sortedFiats: Coin[] = fiatList.map(f => ({
      ...f,
      type: "fiat",     // <— ENSURE type literal
    }));

    // Merge crypto + fiat in alphabetical order
    const mixed = [...cryptos];
    for (const f of sortedFiats) {
      const idx = mixed.findIndex(x =>
        f.symbol.localeCompare(x.symbol) < 0
      );
      if (idx === -1) mixed.push(f);
      else mixed.splice(idx, 0, f);
    }

    const finalList: Coin[] = [
      {
        id: "USD",
        symbol: "USD",
        name: "US Dollar",
        type: "fiat",   // <— IMPORTANT
      },
      ...mixed,
    ];

    setAllCoins(finalList);

    // Default: Bitcoin → USD
    const btc = finalList.find(c => c.id === "bitcoin");
    setFromCoin(btc ?? finalList[1]);
    setToCoin(finalList[0]); // USD
  }

  loadCoins();
}, []);


  /* ===========================================================
        OUTSIDE CLICK CLOSE DROPDOWNS
  ============================================================ */
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

  /* ===========================================================
        REALTIME USD PRICE RESOLUTION
  ============================================================ */

  async function cryptoToUSD_now(id: string) {
    if (cryptoNowCache[id]) return cryptoNowCache[id];

    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const d = await r.json();
    const price = d[id]?.usd ?? 0;

    cryptoNowCache[id] = price;
    return price;
  }

  async function fiatToUSD_now(symbol: string) {
    if (symbol === "USD") return 1;
    if (fiatNowCache[symbol]) return fiatNowCache[symbol];

    const r = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${symbol}`
    );
    const d = await r.json();
    const usdToFiat = d?.rates?.[symbol] ?? 0;
    const v = 1 / usdToFiat;

    fiatNowCache[symbol] = v;
    return v;
  }

  async function computeNow() {
    if (!fromCoin || !toCoin) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return setResult(null);

    const [fromUSD, toUSD] = await Promise.all([
      fromCoin.type === "crypto"
        ? cryptoToUSD_now(fromCoin.id)
        : fiatToUSD_now(fromCoin.symbol),

      toCoin.type === "crypto"
        ? cryptoToUSD_now(toCoin.id)
        : fiatToUSD_now(toCoin.symbol),
    ]);

    setResult((fromUSD / toUSD) * amt);
  }

  useEffect(() => {
    computeNow();
  }, [fromCoin, toCoin, amount]);

  /* ===========================================================
        HISTORY RANGE MAP
  ============================================================ */
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
      default:
        return 30;
    }
  }

  /* ===========================================================
        OPTIMIZED CRYPTO HISTORY (FULL YEAR)
  ============================================================ */
  async function cryptoToUSD_history(id: string): Promise<HistoryPoint[]> {
    const cacheKey = `crypto_${id}`;
    if (cryptoHistoryCache[cacheKey]) return cryptoHistoryCache[cacheKey];

    // Hourly 90 days
    const hourlyReq = fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=90&interval=hourly`
    );

    // Daily 365 days
    const dailyReq = fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`
    );

    const [hrRes, dyRes] = await Promise.all([hourlyReq, dailyReq]);

    const hr = await hrRes.json();
    const dy = await dyRes.json();

    const hourlyPts =
      hr.prices?.map((p: any) => ({
        time: Math.floor(p[0] / 1000) as UTCTimestamp,
        value: p[1],
      })) ?? [];

    const dailyPts =
      dy.prices?.map((p: any) => ({
        time: Math.floor(p[0] / 1000) as UTCTimestamp,
        value: p[1],
      })) ?? [];

    // Merge + remove duplicates
const map: Record<number, number> = {};

// FIX: explicitly type p as HistoryPoint
dailyPts.forEach((p: HistoryPoint) => {
  map[p.time] = p.value;
});

hourlyPts.forEach((p: HistoryPoint) => {
  map[p.time] = p.value;
});

const merged: HistoryPoint[] = Object.entries(map)
  .map(([t, v]) => ({
    time: Number(t) as UTCTimestamp,
    value: v as number,
  }))
  .sort((a, b) => a.time - b.time);


    cryptoHistoryCache[cacheKey] = merged;
    return merged;
  }

  /* ===========================================================
        OPTIMIZED FIAT HISTORY (1 CALL)
  ============================================================ */
  async function fiatToUSD_history(symbol: string): Promise<HistoryPoint[]> {
    if (fiatHistoryCache[symbol]) return fiatHistoryCache[symbol];

    if (symbol === "USD") {
      const arr: HistoryPoint[] = [];
      const now = new Date();
      for (let i = 0; i < 365; i++) {
        const t = new Date(now.getTime() - i * 86400000);
        arr.push({
          time: Math.floor(t.getTime() / 1000) as UTCTimestamp,
          value: 1,
        });
      }
      fiatHistoryCache["USD"] = arr.reverse();
      return fiatHistoryCache["USD"];
    }

    const end = new Date();
    const start = new Date(end.getTime() - 365 * 86400000);

    const sStr = start.toISOString().slice(0, 10);
    const eStr = end.toISOString().slice(0, 10);

    const url = `https://api.frankfurter.app/${sStr}..${eStr}?from=${symbol}&to=USD`;
    const r = await fetch(url);
    const d = await r.json();

    const arr: HistoryPoint[] = Object.entries(d.rates)
      .map(([date, val]: any) => ({
        time: Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp,
        value: val.USD,
      }))
      .sort((a, b) => a.time - b.time);

    fiatHistoryCache[symbol] = arr;
    return arr;
  }

  /* ===========================================================
        OPTIMIZED MERGE
  ============================================================ */
  function mergeNearest(base: HistoryPoint[], comp: HistoryPoint[]) {
    const out: HistoryPoint[] = [];
    let j = 0;

    for (let i = 0; i < base.length; i++) {
      const t = base[i].time;

      while (
        j < comp.length - 1 &&
        Math.abs(comp[j + 1].time - t) < Math.abs(comp[j].time - t)
      ) {
        j++;
      }

      out.push({
        time: t,
        value: base[i].value / comp[j].value,
      });
    }
    return out;
  }

  /* ===========================================================
        UNIVERSAL HISTORY BUILDER
  ============================================================ */
  async function computeHistory() {
    if (!fromCoin || !toCoin) return [];

    const days = rangeToDays(range);

    const [fromFull, toFull] = await Promise.all([
      fromCoin.type === "crypto"
        ? cryptoToUSD_history(fromCoin.id)
        : fiatToUSD_history(fromCoin.symbol),

      toCoin.type === "crypto"
        ? cryptoToUSD_history(toCoin.id)
        : fiatToUSD_history(toCoin.symbol),
    ]);

    if (!fromFull.length || !toFull.length)
      return lastValidData.current;

    // Slice from cached full-year history
    const fromSlice = fromFull.slice(-days);
    const toSlice = toFull.slice(-days);

    const merged = mergeNearest(fromSlice, toSlice);
    lastValidData.current = merged;
    return merged;
  }

  /* ===========================================================
        SWAP
  ============================================================ */
  function handleSwap() {
    if (!fromCoin || !toCoin) return;
    const tmp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(tmp);

    setTimeout(() => computeNow(), 0);
  }

  /* ===========================================================
        X-AXIS LABEL
  ============================================================ */
  function formatXAxisLabel(ts: number): string {
    const d = new Date(ts * 1000);

    if (range === "24H") {
      return d.toLocaleString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    if (["7D", "1M", "3M", "6M"].includes(range)) {
      return d
        .toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })
        .replace(",", "");
    }

    // 1Y
    return d.toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    });
  }

  /* ===========================================================
        UPDATE HISTORY WHEN COINS/RANGE CHANGE
  ============================================================ */
  useEffect(() => {
    if (!fromCoin || !toCoin) return;

    computeHistory().then((data) => {
      if (data.length) lastValidData.current = data;
    });
  }, [fromCoin, toCoin, range]);

  /* ===========================================================
        CHART RENDER
  ============================================================ */
  useEffect(() => {
    if (!chartContainerRef.current || !fromCoin || !toCoin) return;

    const container = chartContainerRef.current;
    container.innerHTML = "";

    const isDark = theme === "dark";

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 390,
      layout: {
        background: { color: isDark ? "#111" : "#fff" },
        textColor: isDark ? "#eee" : "#1a1a1a",
      },
      grid: {
        vertLines: { color: isDark ? "#222" : "#e3e3e3" },
        horzLines: { color: isDark ? "#222" : "#e3e3e3" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (ts: UTCTimestamp) =>
          formatXAxisLabel(Number(ts)),
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.4)" : "rgba(59,130,246,0.4)",
      bottomColor: "rgba(0,0,0,0)",
    });

    /* Tooltip */
    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.zIndex = "999";
    tooltip.style.background = isDark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.9)";
    tooltip.style.color = isDark ? "#fff" : "#000";
    tooltip.style.border = isDark ? "1px solid #444" : "1px solid #ccc";
    tooltip.style.padding = "6px 10px";
    tooltip.style.fontSize = "12px";
    tooltip.style.borderRadius = "6px";
    tooltip.style.display = "none";

    container.style.position = "relative";
    container.appendChild(tooltip);

    const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        tooltip.style.display = "none";
        return;
      }

      const ts = Number(param.time) * 1000;
      const text = new Date(ts).toLocaleString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        month: "short",
        day: "numeric",
        timeZone: userTZ,
      });

      tooltip.innerText = text;
      tooltip.style.left = param.point.x + 12 + "px";
      tooltip.style.top = param.point.y + 12 + "px";
      tooltip.style.display = "block";
    });

    /* Set data */
    const data = lastValidData.current;
    if (data.length) {
      series.setData(
        data.map((p) => ({
          time: p.time,
          value: p.value,
        }))
      );
    }

    chart.timeScale().fitContent();

    /* Resize */
    const resize = () => chart.resize(container.clientWidth, 390);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [fromCoin, toCoin, range, theme]);

  /* ===========================================================
        FILTER
  ============================================================ */
  const filteredCoins = (input: string) => {
    if (!input) return allCoins;
    const s = input.toLowerCase();
    return allCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(s) ||
        c.name.toLowerCase().includes(s)
    );
  };

  /* ===========================================================
        RENDER DROPDOWN ROW
  ============================================================ */
  const renderRow = (coin: Coin, type: "from" | "to") => {
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
  };

  /* ===========================================================
        RENDER
  ============================================================ */
  return (
    <div className="page-container">
      <div className="top-bar">
        <ThemeToggle />
      </div>

      {/* AMOUNT + FROM + SWAP + TO (centered row) */}
      <div className="selector-row">
        {/* AMOUNT */}
        <div className="amount-box">
          <h3>AMOUNT</h3>
          <input
            className="amount-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
          />
          {(!amount || Number(amount) <= 0) && (
            <div className="amount-error">Enter a Number Greater than 0</div>
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

          {openDropdown === "from" && (
            <div className="dropdown-panel" ref={fromPanelRef}>
              <input
                className="dropdown-search"
                placeholder="Search..."
                value={fromSearch}
                onChange={(e) => setFromSearch(e.target.value)}
              />
              {filteredCoins(fromSearch).map((c) => renderRow(c, "from"))}
            </div>
          )}
        </div>

        {/* SWAP */}
        <div onClick={handleSwap} className="swap-circle">
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

          {openDropdown === "to" && (
            <div className="dropdown-panel" ref={toPanelRef}>
              <input
                className="dropdown-search"
                placeholder="Search..."
                value={toSearch}
                onChange={(e) => setToSearch(e.target.value)}
              />
              {filteredCoins(toSearch).map((c) => renderRow(c, "to"))}
            </div>
          )}
        </div>
      </div>

      {/* RESULT */}
      {result !== null && (
        <div className="result-box">
          {amount} {fromCoin?.symbol} ={" "}
          <strong>
            {result.toLocaleString(undefined, {
              maximumFractionDigits: 8,
            })}{" "}
            {toCoin?.symbol}
          </strong>
        </div>
      )}

      {/* RANGE BUTTONS */}
      <div className="range-buttons">
        {["24H", "7D", "1M", "3M", "6M", "1Y"].map((r) => (
          <button
            key={r}
            className={range === r ? "range-active" : "range-btn"}
            onClick={() => setRange(r)}
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
