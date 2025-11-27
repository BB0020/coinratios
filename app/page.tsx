"use client";

import { useEffect, useState, useRef } from "react";
import { createChart } from "lightweight-charts";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

/* ------------------------------------------------------
   20 Major Fiat Currencies (alphabetized)
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

/* USD gets pinned as position #1 */
const USD: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

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

  const [theme, setTheme] = useState("light");

  const fromPanelRef = useRef<HTMLDivElement | null>(null);
  const toPanelRef = useRef<HTMLDivElement | null>(null);

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const lastValidData = useRef<any[]>([]);

  function handleSwap() {
  if (!fromCoin || !toCoin) return;
  const temp = fromCoin;
  setFromCoin(toCoin);
  setToCoin(temp);
}

  /* Watch theme */
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.className);
    });
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  /* ------------------------------------------------------
     LOAD CRYPTO LIST + INSERT FIAT ALPHABETICALLY
  ------------------------------------------------------ */
  useEffect(() => {
    async function loadCoins() {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
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
      setFromCoin(finalList.find((c) => c.id === "bitcoin") || finalList[1]);
      setToCoin(USD);
    }

    loadCoins();
  }, []);

  /* ------------------------------------------------------
     CLICK OUTSIDE TO CLOSE DROPDOWNS
  ------------------------------------------------------ */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openDropdown === "from" && fromPanelRef.current && !fromPanelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setFromSearch("");
      }
      if (openDropdown === "to" && toPanelRef.current && !toPanelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setToSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  /* ------------------------------------------------------
     UNIVERSAL USD-BASELINE PRICE RESOLUTION
     Convert ANY asset to USD historically + realtime
  ------------------------------------------------------ */

  /* Realtime: crypto → USD */
  async function cryptoToUSD_now(id: string) {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const d = await r.json();
    return d[id]?.usd ?? 0;
  }

  /* Realtime: fiat → USD (Frankfurter returns USD→FIAT, so invert when needed) */
  async function fiatToUSD_now(symbol: string) {
    if (symbol === "USD") return 1;
    const r = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${symbol}`);
    const d = await r.json();
    const rate = d.rates?.[symbol] ?? 0;
    return 1 / rate; // (USD->FIAT) inverted = FIAT->USD
  }

  /* Get realtime result for ANY pair using USD baseline */
  async function computeResult() {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (!amt || amt <= 0) return setResult(null);

    let fromUSD = 0;
    let toUSD = 0;

    fromUSD =
      fromCoin.type === "crypto"
        ? await cryptoToUSD_now(fromCoin.id)
        : await fiatToUSD_now(fromCoin.symbol);

    toUSD =
      toCoin.type === "crypto"
        ? await cryptoToUSD_now(toCoin.id)
        : await fiatToUSD_now(toCoin.symbol);

    const finalRate = fromUSD / toUSD;
    setResult(finalRate * amt);
  }

  useEffect(() => {
    if (!fromCoin || !toCoin) return;
    computeResult();
  }, [fromCoin, toCoin, amount]);

  /* ------------------------------------------------------
     HISTORY FETCHING: USD BASELINE
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

  /* Crypto → USD history */
  async function cryptoToUSD_history(id: string, days: number) {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
    );
    const data = await res.json();
    return data.prices?.map((p: any) => ({
      time: Math.floor(p[0] / 1000),
      value: p[1],
    })) ?? [];
  }

  /* Fiat → USD history (daily) */
  async function fiatToUSD_history(symbol: string, days: number) {
    if (symbol === "USD") {
      const arr: any[] = [];
      const now = new Date();
      for (let i = 0; i < days; i++) {
        const t = new Date(now.getTime() - i * 86400000);
        arr.push({
          time: Math.floor(t.getTime() / 1000),
          value: 1,
        });
      }
      return arr.reverse();
    }

    const out: any[] = [];
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000);

    for (let d = 0; d < days; d++) {
      const dt = new Date(start.getTime() + d * 86400000);
      const iso = dt.toISOString().slice(0, 10);

      const r = await fetch(
        `https://api.frankfurter.app/${iso}?from=USD&to=${symbol}`
      );

      const data = await r.json();
      const usdToFiat = data?.rates?.[symbol] ?? null;

      if (usdToFiat) {
        out.push({
          time: Math.floor(dt.getTime() / 1000),
          value: 1 / usdToFiat, // invert USD→FIAT to FIAT→USD
        });
      }
    }

    return out;
  }

  /* Nearest timestamp merging */
  function mergeNearest(base: any[], other: any[], combine: (a: number, b: number) => number) {
    const out: any[] = [];
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

  /* Universal history builder */
  async function computeHistory() {
    if (!fromCoin || !toCoin) return [];

    const days = rangeToDays(range);

    const fromHist =
      fromCoin.type === "crypto"
        ? await cryptoToUSD_history(fromCoin.id, days)
        : await fiatToUSD_history(fromCoin.symbol, days);

    const toHist =
      toCoin.type === "crypto"
        ? await cryptoToUSD_history(toCoin.id, days)
        : await fiatToUSD_history(toCoin.symbol, days);

    if (!fromHist.length || !toHist.length) return lastValidData.current;

    const merged = mergeNearest(fromHist, toHist, (a, b) => a / b);
    lastValidData.current = merged;
    return merged;
  }

  /* ------------------------------------------------------
     CHART
  ------------------------------------------------------ */
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
        vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.35)" : "rgba(59,130,246,0.35)",
      bottomColor: "rgba(0,0,0,0)",
    });

    computeHistory().then((data) => {
      if (data.length) {
        series.setData(data);
        lastValidData.current = data;
      } else {
        series.setData(lastValidData.current);
      }
      chart.timeScale().fitContent();
    });

    const handleResize = () => {
      chart.resize(container.clientWidth, 390);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [fromCoin, toCoin, range, theme]);

  /* ------------------------------------------------------
     RENDER HELPERS
  ------------------------------------------------------ */

  const filteredCoins = (input: string) => {
    if (!input) return allCoins;
    const s = input.toLowerCase();
    return allCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(s) ||
        c.name.toLowerCase().includes(s)
    );
  };

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

  /* ------------------------------------------------------
     RENDER PAGE
  ------------------------------------------------------ */
  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "24px" }}>
      
      {/* TOP AREA */}
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
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setAmount(v);
            }}
            className="amount-input"
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
        <div onClick={handleSwap} style={{ marginTop: "38px" }} className="swap-circle">
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

      {renderResult()}

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
      />
    </div>
  );
}
