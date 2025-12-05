"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  type: "crypto" | "fiat";
}

export default function Page() {
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [amount, setAmount] = useState(1);

  const [fromCoin, setFromCoin] = useState<Coin>({
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
    type: "crypto",
  });

  const [toCoin, setToCoin] = useState<Coin>({
    id: "usd",
    symbol: "USD",
    name: "US Dollar",
    image: "https://flagcdn.com/us.svg",
    type: "fiat",
  });

  const [converted, setConverted] = useState<number | null>(null);
  const [reverseRate, setReverseRate] = useState<number | null>(null);
  const [range, setRange] = useState("24h");

  const chartRef = useRef<HTMLDivElement>(null);
  const chart = useRef<any>(null);
  const series = useRef<any>(null);

  // Load coins
  useEffect(() => {
    fetch("/api/coins")
      .then((r) => r.json())
      .then((data) => setAllCoins(data));
  }, []);

  // Fetch price
  const fetchPrice = useCallback(async () => {
    const url = `/api/price?ids=${fromCoin.id},${toCoin.id}`;
    const res = await fetch(url);
    const data = await res.json();

    const fromUSD = data[fromCoin.id];
    const toUSD = data[toCoin.id];

    if (!fromUSD || !toUSD) {
      setConverted(null);
      setReverseRate(null);
      return;
    }

    const rate = fromUSD / toUSD;
    setConverted(rate * amount);
    setReverseRate(1 / rate);
  }, [fromCoin, toCoin, amount]);

  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  // Range mapping
  const rangeDays: Record<string, number> = {
    "24h": 1,
    "7d": 7,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
  };

  // Fetch history and update chart
  const fetchHistory = useCallback(async () => {
    const days = rangeDays[range];

    const [fromRes, toRes] = await Promise.all([
      fetch(`/api/history?id=${fromCoin.id}&days=${days}`).then((r) => r.json()),
      fetch(`/api/history?id=${toCoin.id}&days=${days}`).then((r) => r.json()),
    ]);

    if (!chart.current) return;

    if (series.current) chart.current.removeSeries(series.current);

    const s = chart.current.addLineSeries({
      color: "#2962FF",
      lineWidth: 2,
    });

    // Compute ratio
    const len = Math.min(fromRes.length, toRes.length);
    const points = [];
    for (let i = 0; i < len; i++) {
      const t1 = fromRes[i].time;
      const t2 = toRes[i].time;
      if (Math.abs(t1 - t2) < 6 * 3600_000) {
        points.push({
          time: Math.floor(t1 / 1000),
          value: fromRes[i].value / toRes[i].value,
        });
      }
    }

    s.setData(points);
    series.current = s;
  }, [fromCoin, toCoin, range]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Chart init
  useEffect(() => {
    if (!chartRef.current) return;

    const c = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 300,
      layout: { background: { color: "transparent" } },
      grid: {
        vertLines: { color: "#ddd" },
        horzLines: { color: "#ddd" },
      },
    });

    chart.current = c;

    const resize = () =>
      c.applyOptions({ width: chartRef.current!.clientWidth });

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Swap button handler
  const swapCoins = () => {
    const temp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(temp);
  };

  const fallbackImg = (e: any) => {
    e.target.src = "/fallback.png";
  };

  return (
    <div className="main-wrapper">

      {/* SINGLE ROW: Amount + From + Swap + To */}
      <div className="row-flex">

        {/* AMOUNT */}
        <div className="amount-box">
          <label className="section-label">AMOUNT</label>
          <input
            className="amount-input"
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* FROM SELECTOR */}
        <Selector
          label="FROM"
          selected={fromCoin}
          setSelected={setFromCoin}
          coins={allCoins}
          fallbackImg={fallbackImg}
        />

        {/* SWAP CIRCLE */}
        <div className="swap-circle" onClick={swapCoins}>
          <img src="/swap.svg" className="swap-icon" />
        </div>

        {/* TO SELECTOR */}
        <Selector
          label="TO"
          selected={toCoin}
          setSelected={setToCoin}
          coins={allCoins}
          fallbackImg={fallbackImg}
        />
      </div>

      {/* Conversion Title */}
      <div className="conversion-title">
        {amount} {fromCoin.symbol} → {toCoin.symbol}
      </div>

      {/* Main Converted Output */}
      <div className="conversion-main">
        {converted !== null
          ? `${converted.toLocaleString(undefined, {
              maximumFractionDigits: 8,
            })} ${toCoin.symbol}`
          : "Loading..."}
      </div>

      {/* Sub Info */}
      {reverseRate !== null && (
        <div className="sub-info">
          1 {fromCoin.symbol} =
          {" "}
          {(converted! / amount).toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}
          {" "}
          {toCoin.symbol}
          <br />
          1 {toCoin.symbol} =
          {" "}
          {reverseRate.toLocaleString(undefined, {
            maximumFractionDigits: 8,
          })}
          {" "}
          {fromCoin.symbol}
        </div>
      )}

      {/* Range Buttons */}
      <div className="range-buttons">
        {["24h", "7d", "1m", "3m", "6m", "1y"].map((r) => (
          <button
            key={r}
            className={range === r ? "active" : ""}
            onClick={() => setRange(r)}
          >
            {r.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div ref={chartRef} className="chart-container"></div>
    </div>
  );
}

/* -------------------- SELECTOR COMPONENT -------------------- */

function Selector({
  label,
  selected,
  setSelected,
  coins,
  fallbackImg,
}: {
  label: string;
  selected: Coin;
  setSelected: (c: Coin) => void;
  coins: Coin[];
  fallbackImg: (e: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = coins.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.symbol.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="selector-wrapper">
      <label className="section-label">{label}</label>

      <div className="selector-box" onClick={() => setOpen(!open)}>
        <img className="selector-img" src={selected.image} onError={fallbackImg} />
        <div className="selector-text">
          <div className="selector-symbol">{selected.symbol}</div>
          <div className="selector-name">{selected.name}</div>
        </div>
      </div>

      {open && (
        <div className="dropdown-panel">
          <input
            className="dropdown-search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {filtered.map((c) => (
            <div
              key={c.id}
              className="dropdown-row"
              onClick={() => {
                setSelected(c);
                setOpen(false);
                setQuery("");
              }}
            >
              <img className="selector-img" src={c.image} onError={fallbackImg} />
              <div>
                <div className="selector-symbol">{c.symbol}</div>
                <div className="selector-name">{c.name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
