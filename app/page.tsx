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

const DEFAULT_FROM: Coin = {
  id: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  type: "crypto",
};

const DEFAULT_TO: Coin = {
  id: "usd",
  symbol: "USD",
  name: "US Dollar",
  image: "https://flagcdn.com/us.svg",
  type: "fiat",
};
export default function Page() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [fromCoin, setFromCoin] = useState<Coin>(DEFAULT_FROM);
  const [toCoin, setToCoin] = useState<Coin>(DEFAULT_TO);
  const [amount, setAmount] = useState<number>(1);
  const [converted, setConverted] = useState<number | null>(null);
  const [reverseRate, setReverseRate] = useState<number | null>(null);
  const [range, setRange] = useState("24h");

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  // Load 1250+ coins
  useEffect(() => {
    async function loadCoins() {
      const r = await fetch("/api/coins");
      const data = await r.json();
      setCoins(data);
    }
    loadCoins();
  }, []);
  // Fetch live price
  const fetchPrice = useCallback(async () => {
    const url = `/api/price?ids=${fromCoin.id},${toCoin.id}`;
    const r = await fetch(url);
    const data = await r.json();

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

  // Fetch chart history
  const fetchHistory = useCallback(async () => {
    const r = await fetch(
      `/api/history?from=${fromCoin.id}&to=${toCoin.id}&range=${range}`
    );
    const data = await r.json();

    if (!chartInstance.current) return;

    // Replace old series
    if (seriesRef.current) {
      chartInstance.current.removeSeries(seriesRef.current);
    }

    const s = chartInstance.current.addLineSeries({
      color: "#2962FF",
      lineWidth: 2,
    });

    const points = data.map((p: any) => ({
      time: Math.floor(p[0] / 1000),
      value: p[1],
    }));

    s.setData(points);
    seriesRef.current = s;
  }, [fromCoin, toCoin, range]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 300,
      layout: { background: { color: "transparent" } },
      grid: {
        vertLines: { color: "#eee" },
        horzLines: { color: "#eee" },
      },
    });

    chartInstance.current = chart;

    const handleResize = () => {
      chart.applyOptions({ width: chartRef.current!.clientWidth });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const swap = () => {
    const f = fromCoin;
    setFromCoin(toCoin);
    setToCoin(f);
  };

  const imgFallback = (e: any) => {
    e.target.src = "/fallback.png";
  };

  return (
    <div className="page-container">

      {/* Amount */}
      <div className="row">
        <div className="input-group">
          <label>AMOUNT</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* From */}
        <div className="input-group">
          <label>FROM</label>
          <Dropdown
            coins={coins}
            selected={fromCoin}
            setSelected={setFromCoin}
            imgFallback={imgFallback}
          />
        </div>

        <button className="swap-btn" onClick={swap}>⇆</button>

        {/* To */}
        <div className="input-group">
          <label>TO</label>
          <Dropdown
            coins={coins}
            selected={toCoin}
            setSelected={setToCoin}
            imgFallback={imgFallback}
          />
        </div>
      </div>

      {/* Conversion */}
      <div className="conversion-title">
        {amount} {fromCoin.symbol} → {toCoin.symbol}
      </div>

      <div className="conversion-main">
        {converted !== null
          ? `${converted.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${toCoin.symbol}`
          : "Loading..."}
      </div>

      <div className="sub-info">
        {reverseRate !== null && (
          <>
            <div>
              1 {fromCoin.symbol} = {(converted! / amount).toLocaleString(undefined, {
                maximumFractionDigits: 8,
              })}{" "}
              {toCoin.symbol}
            </div>
            <div>
              1 {toCoin.symbol} = {reverseRate.toLocaleString(undefined, {
                maximumFractionDigits: 8,
              })}{" "}
              {fromCoin.symbol}
            </div>
          </>
        )}
      </div>

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

      <div ref={chartRef} className="chart-container" />
    </div>
  );
}
function Dropdown({
  coins,
  selected,
  setSelected,
  imgFallback,
}: {
  coins: Coin[];
  selected: Coin;
  setSelected: (c: Coin) => void;
  imgFallback: (e: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = coins.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.symbol.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="dropdown">
      <div className="dropdown-selected" onClick={() => setOpen(!open)}>
        <img src={selected.image} onError={imgFallback} />
        <div>
          <div className="symbol">{selected.symbol}</div>
          <div className="name">{selected.name}</div>
        </div>
      </div>

      {open && (
        <div className="dropdown-menu">
          <input
            className="dropdown-search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="dropdown-list">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="dropdown-item"
                onClick={() => {
                  setSelected(c);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <img src={c.image} onError={imgFallback} />
                <div>
                  <div className="symbol">{c.symbol}</div>
                  <div className="name">{c.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
