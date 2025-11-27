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

/* ------------------------------------------
   FIAT LIST (top 20) sorted alphabetically
------------------------------------------ */
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

/* USD separate because USD is pinned #1 always */
const USD: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};

export default function Page() {

  const [allCoins, setAllCoins] = useState<Coin[]>([]);
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
  const lastValidData = useRef<any[]>([]);
  const [range, setRange] = useState("24H");

  const [theme, setTheme] = useState("light");

  /* Theme watcher */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.className);
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  /* ------------------------------------------
     Load crypto list + merge fiat alphabetically
  ------------------------------------------ */
  useEffect(() => {
    async function loadCoins() {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false"
      );
      const data = await res.json();

      // Convert cryptos
      const cryptos: Coin[] = data.map((c: any) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        image: c.image,
        type: "crypto",
      }));

      // ● Step 1: Cryptos sorted by MC already
      // ● Step 2: Alphabetical fiat list insertion
      const sortedFiat = [...fiatList].sort((a, b) =>
        a.symbol.localeCompare(b.symbol)
      );

      // Insert fiat into crypto list at alphabetical positions
      const mixed: Coin[] = [...cryptos];
      for (const fiat of sortedFiat) {
        const index = mixed.findIndex((coin) =>
          fiat.symbol.localeCompare(coin.symbol) < 0
        );
        if (index === -1) mixed.push(fiat);
        else mixed.splice(index, 0, fiat);
      }

      // Prepend USD as #1
      const finalList = [USD, ...mixed];

      setAllCoins(finalList);

      setFromCoin(finalList.find((c) => c.id === "bitcoin") || cryptos[0]);
      setToCoin(USD);
    }

    loadCoins();
  }, []);

  /* ------------------------------------------
     Click outside to close dropdown
  ------------------------------------------ */
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

  /* ------------------------------------------
     Filtering list
  ------------------------------------------ */
  const filteredCoins = (input: string) => {
    if (!input) return allCoins;
    const s = input.toLowerCase();
    return allCoins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(s) ||
        c.name.toLowerCase().includes(s)
    );
  };

  /* ------------------------------------------
     Fetch FX rate (Frankfurter)
  ------------------------------------------ */
  async function fxRate(from: string, to: string) {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`
    );
    const data = await res.json();
    return data.rates?.[to] || 1;
  }

  /* ------------------------------------------
     Fetch crypto price in USD
  ------------------------------------------ */
  async function cryptoToUSD(cryptoId: string) {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd`
    );
    const data = await res.json();
    return data[cryptoId]?.usd || 0;
  }

  /* ------------------------------------------
     Compute result for ANY pair
  ------------------------------------------ */
  async function computeResult(from: Coin, to: Coin) {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;

    // Case 1: Crypto → Crypto
    if (from.type === "crypto" && to.type === "crypto") {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=${to.id}`
      );
      const data = await res.json();
      const rate = data[from.id]?.[to.id] || 0;
      setResult(rate * amt);
      return;
    }

    // Case 2: Crypto → Fiat
    if (from.type === "crypto" && to.type === "fiat") {
      const usd = await cryptoToUSD(from.id);
      const usdToFiat = await fxRate("USD", to.symbol);
      setResult(usd * usdToFiat * amt);
      return;
    }

    // Case 3: Fiat → Crypto
    if (from.type === "fiat" && to.type === "crypto") {
      const fiatToUSD = await fxRate(from.symbol, "USD");
      const cryptoUSD = await cryptoToUSD(to.id);
      const rate = (fiatToUSD / cryptoUSD) * amt;
      setResult(rate);
      return;
    }

    // Case 4: Fiat → Fiat
    if (from.type === "fiat" && to.type === "fiat") {
      const r = await fxRate(from.symbol, to.symbol);
      setResult(r * amt);
    }
  }

  /* ------------------------------------------
     Recompute result when needed
  ------------------------------------------ */
  useEffect(() => {
    if (fromCoin && toCoin) computeResult(fromCoin, toCoin);
  }, [fromCoin, toCoin, amount]);

  /* ------------------------------------------
     Swap
  ------------------------------------------ */
  const handleSwap = () => {
    if (!fromCoin || !toCoin) return;
    const temp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(temp);
  };

  /* ------------------------------------------
     HISTORY FETCHING for chart
  ------------------------------------------ */
  async function getCryptoHistory(id: string, days: number) {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
    );
    const data = await res.json();
    return data.prices?.map((p: any) => ({
      time: Math.floor(p[0] / 1000),
      value: p[1],
    })) || [];
  }

  async function getFXHistory(from: string, to: string) {
    const now = new Date();
    const days = rangeToDays(range);
    const start = new Date(now.getTime() - days * 86400000);
    const results: any[] = [];

    for (let d = 0; d < days; d++) {
      const dt = new Date(start.getTime() + d * 86400000);
      const iso = dt.toISOString().slice(0, 10);

      const res = await fetch(
        `https://api.frankfurter.app/${iso}?from=${from}&to=${to}`
      );

      const data = await res.json();
      const rate = data?.rates?.[to] || null;

      if (rate) {
        results.push({
          time: Math.floor(dt.getTime() / 1000),
          value: rate,
        });
      }
    }
    return results;
  }

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

  /* ------------------------------------------
     Build chart history for ANY pair
  ------------------------------------------ */
  async function computeHistory(from: Coin, to: Coin) {
    const days = rangeToDays(range);

    // Crypto → Crypto
    if (from.type === "crypto" && to.type === "crypto") {
      const A = await getCryptoHistory(from.id, days);
      const B = await getCryptoHistory(to.id, days);

      if (!A.length || !B.length) return lastValidData.current;

      const map: any[] = [];
      let i = 0;
      while (i < A.length && i < B.length) {
        if (A[i].time === B[i].time) {
          map.push({ time: A[i].time, value: A[i].value / B[i].value });
          i++;
        } else {
          i++;
        }
      }
      lastValidData.current = map;
      return map;
    }

    // Crypto → Fiat
    if (from.type === "crypto" && to.type === "fiat") {
      const usdHist = await getCryptoHistory(from.id, days);
      const fx = await getFXHistory("USD", to.symbol);

      const out: any[] = [];
      let i = 0;
      while (i < usdHist.length && i < fx.length) {
        if (usdHist[i].time === fx[i].time) {
          out.push({
            time: usdHist[i].time,
            value: usdHist[i].value * fx[i].value,
          });
          i++;
        } else i++;
      }
      lastValidData.current = out;
      return out;
    }

    // Fiat → Crypto
    if (from.type === "fiat" && to.type === "crypto") {
      const fx = await getFXHistory(from.symbol, "USD");
      const crypto = await getCryptoHistory(to.id, days);

      const out: any[] = [];
      let i = 0;

      while (i < fx.length && i < crypto.length) {
        if (fx[i].time === crypto[i].time) {
          out.push({
            time: fx[i].time,
            value: fx[i].value / crypto[i].value,
          });
          i++;
        } else i++;
      }
      lastValidData.current = out;
      return out;
    }

    // Fiat → Fiat
    if (from.type === "fiat" && to.type === "fiat") {
      const fx = await getFXHistory(from.symbol, to.symbol);
      lastValidData.current = fx;
      return fx;
    }
  }

  /* ------------------------------------------
     Chart rebuild
  ------------------------------------------ */
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!fromCoin || !toCoin) return;

    const container = chartContainerRef.current;
    container.innerHTML = "";

    const isDark = theme === "dark";

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { color: isDark ? "#111111" : "#ffffff" },
        textColor: isDark ? "#eeeeee" : "#1a1a1a",
      },
      grid: {
        vertLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
        horzLines: { color: isDark ? "#2a2a2a" : "#e3e3e3" },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#4ea1f7" : "#3b82f6",
      topColor: isDark ? "rgba(78,161,247,0.30)" : "rgba(59,130,246,0.30)",
      bottomColor: "rgba(0,0,0,0)",
    });

    computeHistory(fromCoin, toCoin).then((data) => {
      if (data && data.length) {
        series.setData(data);
        lastValidData.current = data;
      } else {
        series.setData(lastValidData.current);
      }
      chart.timeScale().fitContent();
    });

    const resize = () => {
      chart.resize(container.clientWidth, 380);
      chart.timeScale().fitContent();
    };

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [fromCoin, toCoin, range, theme]);

  /* ------------------------------------------
     RENDER
  ------------------------------------------ */
  const renderRow = (coin: Coin, type: "from" | "to", search: string) => {
    const isDisabled =
      (type === "from" && coin.id === toCoin?.id) ||
      (type === "to" && coin.id === fromCoin?.id);

    const isSelected =
      (type === "from" && coin.id === fromCoin?.id) ||
      (type === "to" && coin.id === toCoin?.id);

    let className = "dropdown-row";
    if (isSelected) className += " dropdown-selected";
    if (isDisabled) className += " dropdown-disabled";

    return (
      <div
        key={coin.id}
        className={className}
        onClick={() => {
          if (isDisabled) return;

          if (type === "from") setFromCoin(coin);
          if (type === "to") setToCoin(coin);

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

        {filteredCoins(search).map((coin) =>
          renderRow(coin, type, search)
        )}
      </div>
    );
  };

  const renderResult = () => {
    if (!result || !fromCoin || !toCoin) return null;
    const baseRate = result / Number(amount);

    return (
      <div style={{ textAlign: "center", marginTop: "40px" }}>
        <div style={{ fontSize: "24px", opacity: 0.6 }}>
          1 {fromCoin.symbol} → {toCoin.symbol}
        </div>

        <div
          style={{
            fontSize: "58px",
            fontWeight: 700,
            marginTop: "10px",
          }}
        >
          {result.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
          })}{" "}
          {toCoin.symbol}
        </div>

        <div style={{ opacity: 0.65, marginTop: "10px", fontSize: "19px" }}>
          1 {fromCoin.symbol} = {baseRate.toLocaleString(undefined, { maximumFractionDigits: 8 })} {toCoin.symbol}
          <br />
          1 {toCoin.symbol} = {(1 / baseRate).toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}{" "}
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

  return (
    <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: "32px",
          flexWrap: "wrap",
          marginTop: "20px",
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
        <div onClick={handleSwap} className="swap-circle" style={{ marginTop: "38px" }}>
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
