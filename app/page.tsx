"use client";

/**********************************************************************
 *  SUPER-OPTIMIZED COINRATIOS.COM ENGINE
 *  -------------------------------------------------
 *  - USD Baseline (Crypto→USD / Fiat→USD)
 *  - Full 1-Year History Cached (Crypto + Fiat)
 *  - Fast Frankfurter Range API (1 call per fiat)
 *  - Instant Range Switching (slice only)
 *  - Instant Coin Switching (no refetch)
 *  - Lightweight-Charts v4+ Compatible (UTCTimestamp)
 *  - CMC-style Local Time Tooltip
 *  - CMC-style X-Axis Label Formatting
 **********************************************************************/

import { useEffect, useState, useRef } from "react";
import { createChart, UTCTimestamp } from "lightweight-charts";

/* ===========================================================
      TYPES
=========================================================== */

interface HistoryPoint {
  time: UTCTimestamp;
  value: number;
}

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

/* ===========================================================
      FIAT LIST (alphabetical)
=========================================================== */

const fiatList: Coin[] = [
  { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
  { id: "brl", symbol: "BRL", name: "Brazilian Real",     image: "https://flagcdn.com/br.svg", type: "fiat" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar",    image: "https://flagcdn.com/ca.svg", type: "fiat" },
  { id: "chf", symbol: "CHF", name: "Swiss Franc",        image: "https://flagcdn.com/ch.svg", type: "fiat" },
  { id: "cny", symbol: "CNY", name: "Chinese Yuan",       image: "https://flagcdn.com/cn.svg", type: "fiat" },
  { id: "dkk", symbol: "DKK", name: "Danish Krone",       image: "https://flagcdn.com/dk.svg", type: "fiat" },
  { id: "eur", symbol: "EUR", name: "Euro",               image: "https://flagcdn.com/eu.svg", type: "fiat" },
  { id: "gbp", symbol: "GBP", name: "British Pound",      image: "https://flagcdn.com/gb.svg", type: "fiat" },
  { id: "hkd", symbol: "HKD", name: "Hong Kong Dollar",   image: "https://flagcdn.com/hk.svg", type: "fiat" },
  { id: "inr", symbol: "INR", name: "Indian Rupee",       image: "https://flagcdn.com/in.svg", type: "fiat" },
  { id: "jpy", symbol: "JPY", name: "Japanese Yen",       image: "https://flagcdn.com/jp.svg", type: "fiat" },
  { id: "krw", symbol: "KRW", name: "South Korean Won",   image: "https://flagcdn.com/kr.svg", type: "fiat" },
  { id: "mxn", symbol: "MXN", name: "Mexican Peso",       image: "https://flagcdn.com/mx.svg", type: "fiat" },
  { id: "nok", symbol: "NOK", name: "Norwegian Krone",    image: "https://flagcdn.com/no.svg", type: "fiat" },
  { id: "nzd", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
  { id: "sek", symbol: "SEK", name: "Swedish Krona",      image: "https://flagcdn.com/se.svg", type: "fiat" },
  { id: "sgd", symbol: "SGD", name: "Singapore Dollar",   image: "https://flagcdn.com/sg.svg", type: "fiat" },
  { id: "try", symbol: "TRY", name: "Turkish Lira",       image: "https://flagcdn.com/tr.svg", type: "fiat" },
  { id: "zar", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
];

const USD: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

/* ===========================================================
      CACHES
=========================================================== */

const cryptoHistoryCache: Record<string, HistoryPoint[]> = {};
const fiatHistoryCache:   Record<string, HistoryPoint[]> = {};
const cryptoNowCache:     Record<string, number> = {};
const fiatNowCache:       Record<string, number> = {};

/* ===========================================================
      UTILS
=========================================================== */

function rangeToDays(r: string) {
  switch (r) {
    case "24H": return 1;
    case "7D":  return 7;
    case "1M":  return 30;
    case "3M":  return 90;
    case "6M":  return 180;
    case "1Y":  return 365;
    default:    return 30;
  }
}

/* ===========================================================
      FETCH CRYPTO → USD HISTORY (1y)
=========================================================== */

async function fetchCryptoUSDHistory(id: string): Promise<HistoryPoint[]> {
  if (cryptoHistoryCache[id]) return cryptoHistoryCache[id];

  const r = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365`
  );
  const d = await r.json();

  const arr: HistoryPoint[] = d?.prices?.map((p: any) => ({
    time: Math.floor(p[0] / 1000) as UTCTimestamp,
    value: p[1],
  })) || [];

  cryptoHistoryCache[id] = arr;
  return arr;
}

/* ===========================================================
      FETCH FIAT → USD HISTORY (1y, 1 API call)
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

  const url = `https://api.frankfurter.app/${sStr}..${eStr}?from=USD&to=${symbol}`;
  const r = await fetch(url);
  const d = await r.json();

  const arr: HistoryPoint[] = [];
  for (const date in d.rates) {
    const rate = d.rates[date][symbol];
    arr.push({
      time: Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp,
      value: 1 / rate,
    });
  }

  fiatHistoryCache[symbol] = arr;
  return arr;
}

/* ===========================================================
      FETCH CURRENT USD PRICE
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

async function fetchFiatUSDNow(symbol: string) {
  if (symbol === "USD") return 1;
  if (fiatNowCache[symbol]) return fiatNowCache[symbol];

  const r = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${symbol}`);
  const d = await r.json();
  const usdToFiat = d?.rates?.[symbol] ?? 0;
  const val = 1 / usdToFiat;
  fiatNowCache[symbol] = val;
  return val;
}

/* ===========================================================
      MERGE WITH NEAREST MATCH
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
      PAGE START
=========================================================== */
export default function Page() {

  /* ----------------------
      STATE
  ------------------------ */
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin]     = useState<Coin | null>(null);

  const [openDropdown, setOpen] = useState<"from" | "to" | null>(null);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch]     = useState("");

  const [amount, setAmount] = useState("1");
  const [result, setResult] = useState<number | null>(null);

  const [range, setRange] = useState("24H");
  const [theme, setTheme] = useState("light");

  const chartRef = useRef<HTMLDivElement | null>(null);
  const lastData = useRef<HistoryPoint[]>([]);

  const panelFromRef = useRef<HTMLDivElement | null>(null);
  const panelToRef   = useRef<HTMLDivElement | null>(null);

  /* ----------------------
      WATCH THEME
  ------------------------ */
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.className);
    });
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  /* ----------------------
      LOAD COINS + FIAT
  ------------------------ */
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
      for (const fiat of sortedFiats) {
        const idx = mixed.findIndex(x =>
          fiat.symbol.localeCompare(x.symbol) < 0
        );
        if (idx === -1) mixed.push(fiat);
        else mixed.splice(idx, 0, fiat);
      }

      const finalList = [USD, ...mixed];
      setAllCoins(finalList);

      setFromCoin(finalList.find(c => c.id === "bitcoin") || finalList[1]);
      setToCoin(USD);
    }
    load();
  }, []);

  /* ----------------------
      DROPDOWN CLICK OUT
  ------------------------ */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openDropdown === "from" && panelFromRef.current && !panelFromRef.current.contains(e.target as Node)) {
        setOpen(null);
        setFromSearch("");
      }
      if (openDropdown === "to" && panelToRef.current && !panelToRef.current.contains(e.target as Node)) {
        setOpen(null);
        setToSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  /* ----------------------
      REALTIME CONVERSION
  ------------------------ */
  async function computeNow() {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) return setResult(null);

    const [fromUSD, toUSD] = await Promise.all([
      fromCoin.type === "crypto"
        ? fetchCryptoUSDNow(fromCoin.id)
        : fetchFiatUSDNow(fromCoin.symbol),
      toCoin.type === "crypto"
        ? fetchCryptoUSDNow(toCoin.id)
        : fetchFiatUSDNow(toCoin.symbol),
    ]);

    setResult((fromUSD / toUSD) * amt);
  }

  useEffect(() => {
    computeNow();
  }, [fromCoin, toCoin, amount]);

  /* ----------------------
      HISTORY BUILDER
  ------------------------ */
  async function getHistory(from: Coin, to: Coin) {
    const days = rangeToDays(range);

    const [fromFull, toFull] = await Promise.all([
      from.type === "crypto"
        ? fetchCryptoUSDHistory(from.id)
        : fetchFiatUSDHistory(from.symbol),
      to.type === "crypto"
        ? fetchCryptoUSDHistory(to.id)
        : fetchFiatUSDHistory(to.symbol),
    ]);

    const fromSlice = fromFull.slice(-days);
    const toSlice   = toFull.slice(-days);

    const merged = mergeNearest(fromSlice, toSlice);
    lastData.current = merged;
    return merged;
  }

  /* ----------------------
      SWAP BUTTON
  ------------------------ */
  function handleSwap() {
    if (!fromCoin || !toCoin) return;
    const tmp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(tmp);
  }

  /* ===========================================================
      X-AXIS FORMATTER (CMC-STYLE)
=========================================================== */

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
      CHART RENDER
=========================================================== */
  useEffect(() => {
    if (!chartRef.current || !fromCoin || !toCoin) return;

    const container = chartRef.current;
    container.innerHTML = "";

    const isDark = theme === "dark";

    // Create chart
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
        tickMarkFormatter: (ts: UTCTimestamp) => formatXAxisLabel(ts as number),
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.4)" : "rgba(59,130,246,0.4)",
      bottomColor: "rgba(0,0,0,0)",
    });

    /* --------------------------------------
        LOCAL TIME TOOLTIP (CMC-style)
    -------------------------------------- */

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

      const ts = (param.time as UTCTimestamp) * 1000;

      const str = new Date(ts).toLocaleString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        month: "short",
        day: "numeric",
        timeZone: userTZ,
      });

      tooltip.innerText = str;
      tooltip.style.left = param.point.x + 12 + "px";
      tooltip.style.top  = param.point.y + 12 + "px";
      tooltip.style.display = "block";
    });

    /* --------------------------------------
        SET DATA
    -------------------------------------- */

    getHistory(fromCoin, toCoin).then((data) => {
      const safeData = data.map(p => ({
        time: p.time,
        value: p.value,
      }));
      series.setData(safeData);
      chart.timeScale().fitContent();
    });

    /* --------------------------------------
        RESIZE
    -------------------------------------- */

    const resize = () => chart.resize(container.clientWidth, 390);
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };

  }, [fromCoin, toCoin, range, theme]);


/* ===========================================================
      FILTERED LIST
=========================================================== */

  const filtered = (input: string) => {
    if (!input) return allCoins;
    const s = input.toLowerCase();
    return allCoins.filter(
      c => c.symbol.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)
    );
  };

/* ===========================================================
      RENDER HELPERS
=========================================================== */

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
          setOpen(null);
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

  const renderDropdown = (type: "from" | "to") => {
    const search = type === "from" ? fromSearch : toSearch;
    const setSearch = type === "from" ? setFromSearch : setToSearch;
    const ref = type === "from" ? panelFromRef : panelToRef;

    return (
      <div className="dropdown-panel" ref={ref}>
        <input
          className="dropdown-search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {filtered(search).map((coin) => renderRow(coin, type))}
      </div>
    );
  };

  const renderResult = () => {
    if (!result || !fromCoin || !toCoin) return null;

    const baseRate = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "40px" }}>
        <div style={{ fontSize: "22px", opacity: 0.65 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div style={{ fontSize: "60px", fontWeight: 700, marginTop: "10px" }}>
          {result.toLocaleString(undefined, { maximumFractionDigits: 8 })}
          {" "}
          {toCoin.symbol}
        </div>

        <div style={{ marginTop: "10px", opacity: 0.7, fontSize: "18px" }}>
          1 {fromCoin.symbol} =
          {" "}
          {baseRate.toLocaleString(undefined, { maximumFractionDigits: 8 })}
          {" "}
          {toCoin.symbol}
          <br />
          1 {toCoin.symbol} =
          {" "}
          {(1 / baseRate).toLocaleString(undefined, { maximumFractionDigits: 8 })}
          {" "}
          {fromCoin.symbol}
        </div>
      </div>
    );
  };

  const RangeButtons = () => {
    const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y"];
    return (
      <div style={{ textAlign: "center", marginTop: "35px" }}>
        {ranges.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={range === r ? "range-btn-active" : "range-btn"}
          >
            {r}
          </button>
        ))}
      </div>
    );
  };

  /* ===========================================================
      PAGE RENDER
=========================================================== */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "24px" }}>

      {/* TOP INPUTS */}
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
        {/* AMOUNT BOX */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h3>AMOUNT</h3>
          <input
            value={amount}
            placeholder="0.00"
            inputMode="decimal"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setAmount(v);
            }}
            className="amount-input"
          />

          {(amount === "" || Number(amount) <= 0) && (
            <div style={{ color: "red", marginTop: "6px", fontSize: "14px", fontWeight: 500 }}>
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
              setOpen(openDropdown === "from" ? null : "from");
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
        <div className="swap-circle" onClick={handleSwap} style={{ marginTop: "38px" }}>
          <div className="swap-icon" />
        </div>

        {/* TO */}
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <h3>TO</h3>
          <div
            className="selector-box"
            onClick={() => {
              setOpen(openDropdown === "to" ? null : "to");
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

      {renderResult()}

      <RangeButtons />

      {/* CHART */}
      <div
        ref={chartRef}
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
