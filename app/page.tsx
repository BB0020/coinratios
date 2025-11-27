"use client";

import { useState, useEffect, useRef } from "react";
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
      GLOBAL RANGE MAP
=========================================================== */
const rangeToDays: Record<string, number> = {
  "24H": 1,
  "7D": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

/* ===========================================================
      FIAT LIST (with flags + correct typing)
=========================================================== */

const fiatList: Coin[] = [
  { id: "usd", symbol: "USD", name: "US Dollar",          image: "/flags/us.svg", type: "fiat" },
  { id: "eur", symbol: "EUR", name: "Euro",               image: "/flags/eu.svg", type: "fiat" },
  { id: "jpy", symbol: "JPY", name: "Japanese Yen",       image: "/flags/jp.svg", type: "fiat" },
  { id: "gbp", symbol: "GBP", name: "British Pound",      image: "/flags/gb.svg", type: "fiat" },
  { id: "aud", symbol: "AUD", name: "Australian Dollar",  image: "/flags/au.svg", type: "fiat" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar",    image: "/flags/ca.svg", type: "fiat" },
  { id: "chf", symbol: "CHF", name: "Swiss Franc",        image: "/flags/ch.svg", type: "fiat" },
  { id: "cny", symbol: "CNY", name: "Chinese Yuan",       image: "/flags/cn.svg", type: "fiat" },
  { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar",    image: "/flags/hk.svg", type: "fiat" },
  { id: "nzd", symbol: "NZD", name: "New Zealand Dollar",  image: "/flags/nz.svg", type: "fiat" },
  { id: "sek", symbol: "SEK", name: "Swedish Krona",       image: "/flags/se.svg", type: "fiat" },
  { id: "krw", symbol: "KRW", name: "South Korean Won",    image: "/flags/kr.svg", type: "fiat" },
  { id: "sgd", symbol: "SGD", name: "Singapore Dollar",    image: "/flags/sg.svg", type: "fiat" },
  { id: "nok", symbol: "NOK", name: "Norwegian Krone",     image: "/flags/no.svg", type: "fiat" },
  { id: "mxn", symbol: "MXN", name: "Mexican Peso",        image: "/flags/mx.svg", type: "fiat" },
  { id: "inr", symbol: "INR", name: "Indian Rupee",        image: "/flags/in.svg", type: "fiat" },
  { id: "brl", symbol: "BRL", name: "Brazilian Real",      image: "/flags/br.svg", type: "fiat" },
  { id: "zar", symbol: "ZAR", name: "South African Rand",  image: "/flags/za.svg", type: "fiat" },
  { id: "rub", symbol: "RUB", name: "Russian Ruble",       image: "/flags/ru.svg", type: "fiat" },
  { id: "try", symbol: "TRY", name: "Turkish Lira",        image: "/flags/tr.svg", type: "fiat" },
];

/* FIXED USD CONSTANT */
const USD: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "/flags/us.svg",
  type: "fiat",
};


/* ===========================================================
      GLOBAL CACHES
=========================================================== */
const cryptoHistoryCache: Record<string, HistoryPoint[]> = {};
const fiatHistoryCache: Record<string, HistoryPoint[]> = {};
const cryptoNowCache: Record<string, number> = {};
const fiatNowCache: Record<string, number> = {};

/* ===========================================================
      FETCH CRYPTO HISTORY (HOURLY FOR <90 DAYS, DAILY FOR >90)
=========================================================== */
async function fetchCryptoHistory(id: string, range: string): Promise<HistoryPoint[]> {
  const days = rangeToDays[range];
  const interval = days <= 90 ? "hourly" : "daily";

  const url =
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;

  const r = await fetch(url);
  const d = await r.json();

  if (!d.prices) return [];

  return d.prices.map((p: [number, number]) => ({
    time: Math.floor(p[0] / 1000) as UTCTimestamp,
    value: p[1],
  }));
}

/* ===========================================================
      FETCH FIAT → USD HISTORY (CORRECT DIRECTION)
=========================================================== */
async function fetchFiatUSDHistory(symbol: string): Promise<HistoryPoint[]> {
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
    arr.reverse();
    fiatHistoryCache["USD"] = arr;
    return arr;
  }

  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86400000);

  const sStr = start.toISOString().slice(0, 10);
  const eStr = end.toISOString().slice(0, 10);

  const url = `https://api.frankfurter.app/${sStr}..${eStr}?from=${symbol}&to=USD`;
  const r = await fetch(url);
  const d = await r.json();

  const arr: HistoryPoint[] = [];
  for (const date in d.rates) {
    const usd = d.rates[date]["USD"];
    arr.push({
      time: Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp,
      value: usd,
    });
  }

  fiatHistoryCache[symbol] = arr;
  return arr;
}

/* ===========================================================
      FETCH CURRENT CRYPTO → USD
=========================================================== */
async function fetchCryptoUSDNow(id: string) {
  if (cryptoNowCache[id]) return cryptoNowCache[id];

  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
  );
  const d = await r.json();

  const price = d[id]?.usd ?? 0;
  cryptoNowCache[id] = price;
  return price;
}

/* ===========================================================
      FETCH CURRENT FIAT → USD
=========================================================== */
async function fetchFiatUSDNow(symbol: string) {
  if (symbol === "USD") return 1;
  if (fiatNowCache[symbol]) return fiatNowCache[symbol];

  const r = await fetch(
    `https://api.frankfurter.app/latest?from=${symbol}&to=USD`
  );
  const d = await r.json();
  const usd = d?.rates?.USD ?? 0;

  fiatNowCache[symbol] = usd;
  return usd;
}

/* ===========================================================
      MERGE HISTORY USING NEAREST TIMESTAMP
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
  /* ------------------------------
        STATE
  ------------------------------ */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [amount, setAmount] = useState("1");
  const [range, setRange] = useState("24H");
  const [theme, setTheme] = useState("light");

  const [fromUSDState, setFromUSDState] = useState(1);
  const [toUSDState, setToUSDState] = useState(1);
  const [result, setResult] = useState<number | null>(null);

  const chartRef = useRef<HTMLDivElement | null>(null);
  const lastData = useRef<HistoryPoint[]>([]);

  /* ------------------------------
        WATCH THEME
  ------------------------------ */
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
        const idx = mixed.findIndex(x =>
          f.symbol.localeCompare(x.symbol) < 0
        );
        if (idx === -1) mixed.push(f);
        else mixed.splice(idx, 0, f);
      }

      const finalList = [USD, ...mixed];
      setAllCoins(finalList);

      setFromCoin(finalList.find(c => c.id === "bitcoin") || finalList[1]);
      setToCoin(USD);
    }
    load();
  }, []);

  
  
  /* ===========================================================
        REALTIME CONVERSION
  ============================================================ */
  async function computeNow() {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
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

    setFromUSDState(fromUSD);
    setToUSDState(toUSD);

    const ratio = fromUSD / toUSD;
    setResult(ratio * amt);
  }

  useEffect(() => {
    computeNow();
  }, [fromCoin, toCoin, amount]);

  /* ===========================================================
        HISTORY BUILDER
  ============================================================ */
  async function getHistory(from: Coin, to: Coin) {
    const days = rangeToDays[range];

    const [fromFull, toFull] = await Promise.all([
      from.type === "crypto"
        ? fetchCryptoHistory(from.id, range)
        : fetchFiatUSDHistory(from.symbol),
      to.type === "crypto"
        ? fetchCryptoHistory(to.id, range)
        : fetchFiatUSDHistory(to.symbol),
    ]);

    if (!fromFull.length || !toFull.length) return [];

    const maxTs = Math.min(
      fromFull[fromFull.length - 1].time,
      toFull[toFull.length - 1].time
    );

    const f2 = fromFull.filter(p => p.time <= maxTs);
    const t2 = toFull.filter(p => p.time <= maxTs);

    const merged = mergeNearest(f2, t2);
    lastData.current = merged;
    return merged;
  }

  /* ===========================================================
        UPDATE HISTORY ON ANY CHANGE
  ============================================================ */
  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    getHistory(fromCoin, toCoin);
  }, [fromCoin, toCoin, range]);

  /* ===========================================================
        SWAP BUTTON
  ============================================================ */
  function handleSwap() {
    if (!fromCoin || !toCoin) return;
    const tmp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(tmp);
  }

  /* ===========================================================
        X-AXIS FORMATTER
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

    if (range === "7D" || range === "1M" || range === "3M" || range === "6M") {
      return d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
    }

    return d.toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    });
  }

  /* ===========================================================
        CHART RENDER
  ============================================================ */
  useEffect(() => {
    if (!chartRef.current || !fromCoin || !toCoin) return;

    const container = chartRef.current;
    container.innerHTML = "";

    const isDark = theme === "dark";

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 390,
      layout: {
        background: { color: isDark ? "#111" : "#fff" },
        textColor: isDark ? "#eee" : "#111",
      },
      grid: {
        vertLines: { color: isDark ? "#222" : "#e5e5e5" },
        horzLines: { color: isDark ? "#222" : "#e5e5e5" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: UTCTimestamp) =>
          formatXAxisLabel(Number(t)),
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.4)" : "rgba(59,130,246,0.4)",
      bottomColor: "rgba(0,0,0,0)",
    });

    const data = lastData.current;
    if (data.length) {
      series.setData(
        data.map(p => ({
          time: p.time,
          value: p.value,
        }))
      );
    }

    chart.timeScale().fitContent();

    /* ===========================================================
          LOCAL TIME TOOLTIP
    ============================================================ */
    const tooltip = document.createElement("div");
    tooltip.style.position = "absolute";
    tooltip.style.pointerEvents = "none";
    tooltip.style.zIndex = "999";
    tooltip.style.background = isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)";
    tooltip.style.padding = "6px 10px";
    tooltip.style.borderRadius = "6px";
    tooltip.style.border = isDark ? "1px solid #555" : "1px solid #ccc";
    tooltip.style.color = isDark ? "#fff" : "#000";
    tooltip.style.display = "none";
    container.style.position = "relative";
    container.appendChild(tooltip);

    const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.point) {
        tooltip.style.display = "none";
        return;
      }

      const ts = Number(param.time) * 1000;
      const formatted = new Date(ts).toLocaleString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        month: "short",
        day: "numeric",
        timeZone: userTZ,
      });

      tooltip.innerText = formatted;

      tooltip.style.left = param.point.x + 12 + "px";
      tooltip.style.top = param.point.y + 12 + "px";
      tooltip.style.display = "block";
    });

    return () => {
      chart.remove();
    };
  }, [fromCoin, toCoin, range, theme]);

/* ===========================================================
      RENDER UI
=========================================================== */
return (
  <>
    {/* ------------------------------
          THEME TOGGLE BAR
        ------------------------------ */}
    <div className="top-bar">
      <ThemeToggle />
    </div>

    {/* ------------------------------
          MAIN CONVERTER UI
        ------------------------------ */}
    <div className="mt-8 max-w-3xl mx-auto px-4">
      <h1 className="text-center text-3xl font-bold mb-6">
        Crypto Ratio Converter
      </h1>

      {/* AMOUNT + SWAP */}
      <div className="flex justify-center gap-4 items-center mb-4">
        <input
          type="number"
          className="border px-3 py-2 rounded w-32 text-center"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount"
        />

        <button
          onClick={handleSwap}
          className="px-3 py-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          ⇄
        </button>
      </div>

      {/* FROM / TO DROPDOWNS */}
      <div className="flex justify-center gap-6 mb-6">
        <select
          className="border px-3 py-2 rounded"
          value={fromCoin?.symbol}
          onChange={e =>
            setFromCoin(allCoins.find(c => c.symbol === e.target.value) || null)
          }
        >
          {allCoins.map(c => (
            <option key={c.symbol} value={c.symbol}>
              {c.symbol}
            </option>
          ))}
        </select>

        <select
          className="border px-3 py-2 rounded"
          value={toCoin?.symbol}
          onChange={e =>
            setToCoin(allCoins.find(c => c.symbol === e.target.value) || null)
          }
        >
          {allCoins.map(c => (
            <option key={c.symbol} value={c.symbol}>
              {c.symbol}
            </option>
          ))}
        </select>
      </div>

      {/* RESULT */}
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold">
          {result ? result.toLocaleString() : "--"}
        </h2>

        {fromCoin && toCoin && (
          <div className="text-gray-500 mt-2 text-center">
            <p>
              1 {fromCoin.symbol} = {(fromUSDState / toUSDState).toFixed(6)}{" "}
              {toCoin.symbol}
            </p>
            <p>
              1 {toCoin.symbol} = {(toUSDState / fromUSDState).toFixed(6)}{" "}
              {fromCoin.symbol}
            </p>
          </div>
        )}
      </div>

      {/* RANGE BUTTONS */}
      <div className="flex justify-center gap-3 mb-4">
        {["24H", "7D", "1M", "3M", "6M", "1Y"].map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 rounded ${
              range === r
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* CHART */}
      <div
        ref={chartRef}
        className="w-full h-[390px] border rounded"
      ></div>
    </div>
  </>
);

}
