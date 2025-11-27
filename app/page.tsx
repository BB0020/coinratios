"use client";

import { useEffect, useState, useRef } from "react";
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
      FIAT LIST (20)
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

const USD: Coin = { id: "USD", symbol: "USD", name: "US Dollar", type: "fiat" };

/* ===========================================================
      CACHES
=========================================================== */
const fiatNowCache: Record<string, number> = {};
const cryptoNowCache: Record<string, number> = {};
const fiatHistoryCache: Record<string, HistoryPoint[]> = {};
const cryptoHistoryCache: Record<string, HistoryPoint[]> = {};

/* ===========================================================
      RANGE MAP
=========================================================== */
const rangeToDays = (range: string) =>
  ({ "24H": 1, "7D": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }[range] || 1);

/* ===========================================================
      FETCH PRICES
=========================================================== */
async function fetchCryptoUSDNow(id: string) {
  if (cryptoNowCache[id]) return cryptoNowCache[id];
  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
  );
  const d = await r.json();
  const val = d[id]?.usd ?? 0;
  cryptoNowCache[id] = val;
  return val;
}

async function fetchFiatUSDNow(symbol: string) {
  if (symbol === "USD") return 1;
  if (fiatNowCache[symbol]) return fiatNowCache[symbol];

  const r = await fetch(
    `https://api.frankfurter.app/latest?from=${symbol}&to=USD`
  );
  const d = await r.json();
  const rate = d?.rates?.USD ?? 0;

  const val = rate === 0 ? 1 : rate;
  fiatNowCache[symbol] = val;
  return val;
}

/* ===========================================================
      HISTORY FETCHERS
=========================================================== */
async function fetchCryptoHistory(id: string, range: string) {
  if (cryptoHistoryCache[id + range]) return cryptoHistoryCache[id + range];

  const days = rangeToDays(range);
  const interval = days <= 90 ? "hourly" : "daily";

  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
  const r = await fetch(url);
  const d = await r.json();

  const points: HistoryPoint[] = d.prices.map((p: [number, number]) => ({
    time: Math.floor(p[0] / 1000) as UTCTimestamp,
    value: p[1],
  }));

  cryptoHistoryCache[id + range] = points;
  return points;
}

async function fetchFiatUSDHistory(symbol: string) {
  if (symbol === "USD")
    return new Array(365).fill(0).map((_, i) => ({
      time: (Math.floor(Date.now() / 1000) - i * 86400) as UTCTimestamp,
      value: 1,
    }));

  if (fiatHistoryCache[symbol]) return fiatHistoryCache[symbol];

  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86400000);

  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);

  const r = await fetch(
    `https://api.frankfurter.app/${s}..${e}?from=${symbol}&to=USD`
  );
  const d = await r.json();

  const arr: HistoryPoint[] = Object.entries(d.rates).map(([date, v]: any) => ({
    time: Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp,
    value: v.USD,
  }));

  fiatHistoryCache[symbol] = arr;
  return arr;
}

/* ===========================================================
      MERGE HISTORY
=========================================================== */
function mergeNearest(from: HistoryPoint[], to: HistoryPoint[]) {
  const out: HistoryPoint[] = [];
  let j = 0;

  for (let i = 0; i < from.length; i++) {
    while (
      j < to.length - 1 &&
      Math.abs(to[j + 1].time - from[i].time) <
        Math.abs(to[j].time - from[i].time)
    ) {
      j++;
    }

    out.push({
      time: from[i].time,
      value: from[i].value / to[j].value,
    });
  }

  return out;
}

/* ===========================================================
      PAGE COMPONENT
=========================================================== */
export default function Page() {
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);
  const [open, setOpen] = useState<"from" | "to" | null>(null);
  const [search, setSearch] = useState("");

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);
  const [range, setRange] = useState("24H");

  const chartRef = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<any>(null);

  /* ------------------------------
      LOAD COINS
  ------------------------------ */
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

      const sortedFiats = [...fiatList].sort((a, b) =>
        a.symbol.localeCompare(b.symbol)
      );

      const mixed = [...cryptos];
      for (const f of sortedFiats) {
        const idx = mixed.findIndex((x) =>
          f.symbol.localeCompare(x.symbol) < 0
        );
        if (idx === -1) mixed.push(f);
        else mixed.splice(idx, 0, f);
      }

      const finalList = [USD, ...mixed];
      setAllCoins(finalList);
      setFromCoin(finalList.find((c) => c.id === "bitcoin") || finalList[1]);
      setToCoin(USD);
    }
    load();
  }, []);

  /* ------------------------------
      REALTIME RESULT
  ------------------------------ */
  useEffect(() => {
    async function calc() {
      if (!fromCoin || !toCoin) return;

      const a = Number(amount);
      if (!a || a <= 0) {
        setResult(null);
        return;
      }

      const [fromUSD, toUSD] = await Promise.all([
        fromCoin.type === "crypto"
          ? fetchCryptoUSDNow(fromCoin.id)
          : fetchFiatUSDNow(fromCoin.symbol),
        toCoin.type === "crypto"
          ? fetchCryptoUSDNow(toCoin.id)
          : fetchFiatUSDNow(toCoin.symbol),
      ]);

      setResult((fromUSD / toUSD) * a);
    }
    calc();
  }, [fromCoin, toCoin, amount]);

  /* ------------------------------
      HISTORY CHART
  ------------------------------ */
  useEffect(() => {
    async function loadChart() {
      if (!fromCoin || !toCoin || !chartRef.current) return;

      const container = chartRef.current;
      container.innerHTML = "";

      const chart = createChart(container, {
        height: 350,
        layout: {
          background: { color: "transparent" },
          textColor: "#555",
        },
        timeScale: { timeVisible: true },
      });

      const series = chart.addAreaSeries({
        lineColor: "#3b82f6",
        topColor: "rgba(59,130,246,0.4)",
        bottomColor: "rgba(59,130,246,0.05)",
      });

      seriesRef.current = series;

      const [fh, th] = await Promise.all([
        fromCoin.type === "crypto"
          ? fetchCryptoHistory(fromCoin.id, range)
          : fetchFiatUSDHistory(fromCoin.symbol),

        toCoin.type === "crypto"
          ? fetchCryptoHistory(toCoin.id, range)
          : fetchFiatUSDHistory(toCoin.symbol),
      ]);

      const merged = mergeNearest(fh, th);
      series.setData(merged);
    }

    loadChart();
  }, [fromCoin, toCoin, range]);

  /* ------------------------------
      SWAP
  ------------------------------ */
  function handleSwap() {
    if (!fromCoin || !toCoin) return;
    const temp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(temp);
  }

  /* ------------------------------
      RENDER COIN BOX
  ------------------------------ */
  function renderBox(coin: Coin | null, type: "from" | "to") {
    if (!coin) return null;

    return (
      <div className="coin-box" onClick={() => setOpen(type)}>
        <img
          src={
            coin.type === "fiat"
              ? `https://flagsapi.com/${coin.symbol.slice(0, 2)}/flat/64.png`
              : coin.image
          }
          className="coin-logo"
        />
        <div className="coin-text">
          <div className="coin-symbol">{coin.symbol}</div>
          <div className="coin-name">{coin.name}</div>
        </div>
      </div>
    );
  }

  /* ------------------------------
      FILTERED DROPDOWN
  ------------------------------ */
  const filteredCoins = allCoins.filter((c) => {
    const s = search.toLowerCase();
    return (
      c.symbol.toLowerCase().includes(s) ||
      c.name.toLowerCase().includes(s)
    );
  });

  return (
    <div className="main-container">
      {/* THEME TOGGLE */}
      <div className="top-bar">
        <ThemeToggle />
      </div>

      {/* TITLE */}
      <h1 style={{ textAlign: "center", fontSize: 34, marginBottom: 30 }}>
        Crypto Ratio Converter
      </h1>

      {/* AMOUNT + COIN ROW */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* AMOUNT */}
        <div style={{ width: "100%", maxWidth: 520 }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="amount-input"
          />
        </div>

        {/* ROW — FROM + SWAP + TO */}
        <div className="selector-row">
          {renderBox(fromCoin, "from")}

          <button className="swap-btn" onClick={handleSwap}>
            ↕
          </button>

          {renderBox(toCoin, "to")}
        </div>
      </div>

      {/* DROPDOWN PANEL */}
      {open && (
        <div className="dropdown-panel">
          <input
            className="dropdown-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {filteredCoins.map((c) => (
            <div
              key={c.symbol}
              className="dropdown-row"
              onClick={() => {
                if (open === "from") setFromCoin(c);
                if (open === "to") setToCoin(c);
                setOpen(null);
                setSearch("");
              }}
            >
              <img
                src={
                  c.type === "fiat"
                    ? `https://flagsapi.com/${c.symbol.slice(0, 2)}/flat/64.png`
                    : c.image
                }
                className="coin-logo"
                style={{ width: 40, height: 40 }}
              />

              <div>
                <div className="dropdown-row-symbol">{c.symbol}</div>
                <div className="dropdown-row-name">{c.name}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RESULT */}
      <div className="result-section" style={{ marginTop: 30 }}>
        {fromCoin && toCoin && result !== null && (
          <>
            <div className="result-big">
              {result.toLocaleString(undefined, {
                maximumFractionDigits: 8,
              })}{" "}
              {toCoin.symbol}
            </div>

            <div className="result-sub">
              1 {fromCoin.symbol} ={" "}
              {(Number(result) / Number(amount)).toFixed(8)}{" "}
              {toCoin.symbol}
            </div>
          </>
        )}
      </div>

      {/* RANGE BUTTONS */}
      <div className="range-row">
        {["24H", "7D", "1M", "3M", "6M", "1Y"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`range-btn ${range === r ? "active" : ""}`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* CHART */}
      <div className="chart-box" ref={chartRef}></div>
    </div>
  );
}
