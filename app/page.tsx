"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, UTCTimestamp, IChartApi } from "lightweight-charts";

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
const USD: Coin = {
  id: "USD",
  symbol: "USD",
  name: "US Dollar",
  image: "/flags/usd.png",
  type: "fiat",
};

const fiatList: Coin[] = [
  USD,
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

/* ===========================================================
      CACHES
=========================================================== */
const cryptoHistoryCache: Record<string, HistoryPoint[]> = {};
const fiatHistoryCache: Record<string, HistoryPoint[]> = {};
const cryptoNowCache: Record<string, number> = {};
const fiatNowCache: Record<string, number> = {};

/* ===========================================================
      PAGE
=========================================================== */
export default function Page() {
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [amount, setAmount] = useState("1");
  const [range, setRange] = useState("24H");
  const [result, setResult] = useState<number | null>(null);

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<IChartApi | null>(null);

  const lastValidData = useRef<HistoryPoint[]>([]);
  const areaSeriesRef = useRef<any>(null);

  const [theme, setTheme] = useState<"light" | "dark">("light");

  /* ===========================================================
        WATCH THEME (for chart updates)
  ============================================================ */
  useEffect(() => {
    const html = document.documentElement;
    function update() {
      if (html.classList.contains("dark")) setTheme("dark");
      else setTheme("light");
    }

    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });

    update();
    return () => obs.disconnect();
  }, []);

  /* ===========================================================
        LOAD COINS
  ============================================================ */
  useEffect(() => {
    async function load() {
      const r = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      );
      const d = await r.json();

      const cryptos: Coin[] = d.map((c: any) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        image: c.image,
        type: "crypto",
      }));

      const sortedFiats = [...fiatList].sort((a, b) => a.symbol.localeCompare(b.symbol));

      const mixed: Coin[] = [...cryptos];
      for (const f of sortedFiats) {
        const idx = mixed.findIndex((x) => f.symbol.localeCompare(x.symbol) < 0);
        if (idx === -1) mixed.push(f);
        else mixed.splice(idx, 0, f);
      }

      setAllCoins(mixed);

      const btc = mixed.find((c) => c.id === "bitcoin");
      setFromCoin(btc || mixed[0]);
      setToCoin(USD);
    }

    load();
  }, []);

  /* ===========================================================
        CURRENT PRICE IN USD
  ============================================================ */
  async function cryptoToUSD_now(id: string) {
    if (cryptoNowCache[id]) return cryptoNowCache[id];

    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const d = await r.json();
    const val = d[id]?.usd ?? 0;

    cryptoNowCache[id] = val;
    return val;
  }

  async function fiatToUSD_now(symbol: string) {
    if (symbol === "USD") return 1;

    if (fiatNowCache[symbol]) return fiatNowCache[symbol];

    const r = await fetch(`https://api.frankfurter.app/latest?from=${symbol}&to=USD`);
    const d = await r.json();
    const val = d?.rates?.USD ?? 1;

    fiatNowCache[symbol] = val;
    return val;
  }

  /* ===========================================================
        UPDATE LIVE RESULT
  ============================================================ */
  useEffect(() => {
    async function compute() {
      if (!fromCoin || !toCoin) return;

      const fromUSD =
        fromCoin.type === "crypto"
          ? await cryptoToUSD_now(fromCoin.id)
          : await fiatToUSD_now(fromCoin.symbol);

      const toUSD =
        toCoin.type === "crypto"
          ? await cryptoToUSD_now(toCoin.id)
          : await fiatToUSD_now(toCoin.symbol);

      if (!amount || Number(amount) <= 0) {
        setResult(null);
        return;
      }

      setResult((Number(amount) * fromUSD) / toUSD);
    }

    compute();
  }, [fromCoin, toCoin, amount]);

  /* ===========================================================
        RANGE → DAYS
  ============================================================ */
  function rangeToDays(r: string) {
    return r === "24H"
      ? 1
      : r === "7D"
      ? 7
      : r === "1M"
      ? 30
      : r === "3M"
      ? 90
      : r === "6M"
      ? 180
      : 365;
  }

  /* ===========================================================
        CRYPTO HISTORY
=========================================================== */
async function cryptoHistory(id: string) {
  if (cryptoHistoryCache[id]) return cryptoHistoryCache[id];

  const hrReq = fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=90&interval=hourly`
  );
  const dyReq = fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`
  );

  const [hrRes, dyRes] = await Promise.all([hrReq, dyReq]);
  const hr = await hrRes.json();
  const dy = await dyRes.json();

  const hourly: HistoryPoint[] =
    hr.prices?.map((p: [number, number]) => ({
      time: Math.floor(p[0] / 1000) as UTCTimestamp,
      value: p[1],
    })) ?? [];

  const daily: HistoryPoint[] =
    dy.prices?.map((p: [number, number]) => ({
      time: Math.floor(p[0] / 1000) as UTCTimestamp,
      value: p[1],
    })) ?? [];

  // FIXED: explicitly type p so TypeScript knows it's a HistoryPoint
  const map: Record<number, number> = {};

  daily.forEach((p: HistoryPoint) => {
    map[p.time] = p.value;
  });

  hourly.forEach((p: HistoryPoint) => {
    map[p.time] = p.value;
  });

  const merged: HistoryPoint[] = Object.entries(map)
    .map(([t, v]) => ({
      time: Number(t) as UTCTimestamp,
      value: v as number,
    }))
    .sort((a, b) => a.time - b.time);

  cryptoHistoryCache[id] = merged;
  return merged;
}

/* ===========================================================
      FIAT HISTORY
=========================================================== */

  async function fiatHistory(symbol: string) {
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
      return arr.reverse();
    }

    const end = new Date();
    const start = new Date(end.getTime() - 365 * 86400000);
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);

    const r = await fetch(
      `https://api.frankfurter.app/${s}..${e}?from=${symbol}&to=USD`
    );
    const d = await r.json();

    const arr: HistoryPoint[] = Object.entries(d.rates)
      .map(([date, v]: any) => ({
        time: Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp,
        value: v.USD,
      }))
      .sort((a, b) => a.time - b.time);

    fiatHistoryCache[symbol] = arr;
    return arr;
  }

  /* ===========================================================
        MERGE NEAREST
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
        HISTORY BUILDER
  ============================================================ */
  async function computeHistory() {
    if (!fromCoin || !toCoin) return lastValidData.current;

    const days = rangeToDays(range);

    const [fromFull, toFull] = await Promise.all([
      fromCoin.type === "crypto"
        ? cryptoHistory(fromCoin.id)
        : fiatHistory(fromCoin.symbol),
      toCoin.type === "crypto"
        ? cryptoHistory(toCoin.id)
        : fiatHistory(toCoin.symbol),
    ]);

    const fromSlice = fromFull.slice(-days);
    const toSlice = toFull.slice(-days);

    const merged = mergeNearest(fromSlice, toSlice);

    if (merged.length) lastValidData.current = merged;

    return lastValidData.current;
  }

  /* ===========================================================
        CHART (LIGHT + DARK MODE)
  ============================================================ */
  useEffect(() => {
    async function drawChart() {
      if (!chartRef.current) return;

      const container = chartRef.current;
      container.innerHTML = "";

      const isDark = theme === "dark";

      const chart = createChart(container, {
        width: container.clientWidth,
        height: 390,
        layout: {
          background: { color: isDark ? "#111111" : "#ffffff" },
          textColor: isDark ? "#e6e6e6" : "#1a1a1a",
        },
        grid: {
          vertLines: { color: isDark ? "#222222" : "#e6e6e6" },
          horzLines: { color: isDark ? "#222222" : "#e6e6e6" },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartInstance.current = chart;

      const area = chart.addAreaSeries({
  lineColor: isDark ? "#4ea1f7" : "#3b82f6",
  topColor: isDark ? "rgba(78,161,247,0.4)" : "rgba(59,130,246,0.4)",
  bottomColor: "rgba(0,0,0,0)",
});

areaSeriesRef.current = area;   // <--- IMPORTANT


      const data = lastValidData.current;
      if (data.length) area.setData(data);

      const resize = () =>
        chart.resize(container.clientWidth, 390);
      window.addEventListener("resize", resize);

      return () => {
        window.removeEventListener("resize", resize);
        chart.remove();
      };
    }

    drawChart();
  }, [fromCoin, toCoin, range, theme]);

  /* ===========================================================
      REFRESH HISTORY WHEN INPUTS CHANGE
=========================================================== */
useEffect(() => {
  computeHistory().then(() => {
    // UPDATED: use the stored area series ref instead of getSeries()
    if (areaSeriesRef.current && lastValidData.current.length) {
      areaSeriesRef.current.setData(lastValidData.current);
    }
  });
}, [fromCoin, toCoin, range]);


  /* ===========================================================
        DROPDOWN FILTER
  ============================================================ */
  function filterCoins(input: string) {
    if (!input) return allCoins;
    const s = input.toLowerCase();
    return allCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(s) ||
        c.name.toLowerCase().includes(s)
    );
  }

  /* ===========================================================
        DROPDOWN ROW
  ============================================================ */
  function renderRow(coin: Coin, type: "from" | "to") {
    const disabled =
      (type === "from" && coin.id === toCoin?.id) ||
      (type === "to" && coin.id === fromCoin?.id);

    return (
      <div
        key={coin.id}
        className={`dropdown-row ${disabled ? "dropdown-disabled" : ""}`}
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
  }

  /* ===========================================================
        SWAP
  ============================================================ */
  function swapCoins() {
    if (!fromCoin || !toCoin) return;
    setFromCoin(toCoin);
    setToCoin(fromCoin);
  }

  /* ===========================================================
        UI (IDENTICAL TO page 11)
  ============================================================ */
  return (
    <div className="page-container">
      {/* CENTERED ROW */}
      <div className="selector-row">
        {/* AMOUNT */}
        <div className="amount-box">
          <h3>AMOUNT</h3>
          <input
            className="amount-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {(!amount || Number(amount) <= 0) && (
            <div className="amount-error">Enter a Number Greater than 0</div>
          )}
        </div>

        {/* FROM */}
        <div className="selector-col" ref={fromPanelRef}>
          <h3>FROM</h3>
          <div
            className="selector-box"
            onClick={() =>
              setOpenDropdown(openDropdown === "from" ? null : "from")
            }
          >
            <img src={fromCoin?.image} className="selector-img" />
            <div>
              <div className="selector-symbol">{fromCoin?.symbol}</div>
              <div className="selector-name">{fromCoin?.name}</div>
            </div>
          </div>

          {openDropdown === "from" && (
            <div className="dropdown-panel">
              <input
                className="dropdown-search"
                value={fromSearch}
                onChange={(e) => setFromSearch(e.target.value)}
                placeholder="Search..."
              />
              {filterCoins(fromSearch).map((c) => renderRow(c, "from"))}
            </div>
          )}
        </div>

        {/* SWAP */}
        <div className="swap-circle" onClick={swapCoins}>
          <div className="swap-icon" />
        </div>

        {/* TO */}
        <div className="selector-col" ref={toPanelRef}>
          <h3>TO</h3>
          <div
            className="selector-box"
            onClick={() =>
              setOpenDropdown(openDropdown === "to" ? null : "to")
            }
          >
            <img src={toCoin?.image} className="selector-img" />
            <div>
              <div className="selector-symbol">{toCoin?.symbol}</div>
              <div className="selector-name">{toCoin?.name}</div>
            </div>
          </div>

          {openDropdown === "to" && (
            <div className="dropdown-panel">
              <input
                className="dropdown-search"
                value={toSearch}
                onChange={(e) => setToSearch(e.target.value)}
                placeholder="Search..."
              />
              {filterCoins(toSearch).map((c) => renderRow(c, "to"))}
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
      <div ref={chartRef} className="chart-container" />
    </div>
  );
}
