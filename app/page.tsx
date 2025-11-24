"use client";

import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  createChart,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";

// ---------------- FIAT LIST (FIXED FLAG SIZES) ----------------
interface Item {
  id: string;
  symbol: string;
  name: string;
  type: "crypto" | "fiat";
  image: string;
}

const fiatList: Item[] = [
  { id: "usd", symbol: "USD", name: "US Dollar", type: "fiat", image: "https://flagcdn.com/32x24/us.png" },
  { id: "eur", symbol: "EUR", name: "Euro", type: "fiat", image: "https://flagcdn.com/32x24/eu.png" },
  { id: "gbp", symbol: "GBP", name: "British Pound", type: "fiat", image: "https://flagcdn.com/32x24/gb.png" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar", type: "fiat", image: "https://flagcdn.com/32x24/ca.png" },
  { id: "aud", symbol: "AUD", name: "Australian Dollar", type: "fiat", image: "https://flagcdn.com/32x24/au.png" }
];

export default function Page() {
  const [allCoins, setAllCoins] = useState<Item[]>([]);
  const [filtered, setFiltered] = useState<Item[]>([]);
  const [search, setSearch] = useState("");

  const [amount, setAmount] = useState("1");
  const [isInvalid, setIsInvalid] = useState(false);

  const [fromCoin, setFromCoin] = useState<Item | null>(null);
  const [toCoin, setToCoin] = useState<Item | null>(null);

  const [result, setResult] = useState<number | null>(null);
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);

  // ---------------- CHART ----------------
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [range, setRange] = useState("30");


  // ---------------- CLOSE DROPDOWN OUTSIDE ----------------
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);


  // ---------------- LOAD COINGECKO COINS ----------------
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=120&page=1"
      )
      .then((res) => {
        const cryptoItems: Item[] = res.data.map((c: any) => ({
          id: c.id,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          type: "crypto",
          image: c.image,
        }));

        const combined = [...fiatList, ...cryptoItems];
        setAllCoins(combined);
        setFromCoin(cryptoItems.find((c) => c.symbol === "BTC") || combined[0]);
        setToCoin(fiatList.find((c) => c.symbol === "USD") || combined[1]);
      })
      .catch(console.error);
  }, []);


  // ---------------- SEARCH FILTER ----------------
  useEffect(() => {
    if (!search) {
      setFiltered(allCoins);
      return;
    }
    const q = search.toLowerCase();

    setFiltered(
      allCoins.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q)
      )
    );
  }, [search, allCoins]);


  // ---------------- AMOUNT ----------------
  const handleAmount = (v: string) => {
    if (/^[0-9]*\.?[0-9]*$/.test(v)) {
      setAmount(v);
      setIsInvalid(!v || Number(v) <= 0);
    }
  };


  // ---------------- FETCH RATE ----------------
  const fetchRate = async () => {
    if (!fromCoin || !toCoin) return;
    if (isInvalid || Number(amount) <= 0) {
      setResult(null);
      return;
    }

    const from = fromCoin;
    const to = toCoin;

    try {
      // FIAT → FIAT
      if (from.type === "fiat" && to.type === "fiat") {
        const fx = await axios.get(
          `https://api.frankfurter.app/latest?from=${from.symbol}&to=${to.symbol}`
        );
        const rate = fx.data?.rates?.[to.symbol];
        setResult(Number(amount) * rate);
        return;
      }

      // CRYPTO → USD
      if (from.type === "crypto" && to.symbol === "USD") {
        const cg = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
        );
        const price = cg.data?.[from.id]?.usd;
        setResult(Number(amount) * price);
        return;
      }

      // USD → CRYPTO
      if (from.symbol === "USD" && to.type === "crypto") {
        const usd_amt = Number(amount);
        const cg = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
        );
        const cryptoUSD = cg.data?.[to.id]?.usd;
        setResult(usd_amt / cryptoUSD);
        return;
      }

      // CRYPTO → FIAT
      if (from.type === "crypto" && to.type === "fiat") {
        const cg = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
        );
        const cryptoUSD = cg.data?.[from.id]?.usd;

        const fx = await axios.get(
          `https://api.frankfurter.app/latest?from=USD&to=${to.symbol}`
        );
        const usdToFiat = fx.data?.rates?.[to.symbol];

        setResult(Number(amount) * cryptoUSD * usdToFiat);
        return;
      }

      // FIAT → CRYPTO
      if (from.type === "fiat" && to.type === "crypto") {
        const fx = await axios.get(
          `https://api.frankfurter.app/latest?from=${from.symbol}&to=USD`
        );
        const fiatToUSD = fx.data?.rates?.USD;

        const cg = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
        );
        const cryptoUSD = cg.data?.[to.id]?.usd;

        setResult((Number(amount) * fiatToUSD) / cryptoUSD);
        return;
      }

      // CRYPTO → CRYPTO
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id},${to.id}&vs_currencies=usd`
      );
      const fromUSD = cg.data?.[from.id]?.usd;
      const toUSD = cg.data?.[to.id]?.usd;

      setResult((Number(amount) * fromUSD) / toUSD);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRate();
    const interval = setInterval(fetchRate, 8000);
    return () => clearInterval(interval);
  }, [fromCoin, toCoin, amount]);


  // ---------------- SWAP ----------------
  const swapCoins = () => {
    if (!fromCoin || !toCoin) return;
    const tmp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(tmp);
  };


  // ---------------- APPLY SELECTION ----------------
  const applySelection = (coin: Item, side: "from" | "to") => {
    if (side === "from") setFromCoin(coin);
    else setToCoin(coin);

    setOpenDropdown(null);
    setSearch("");
  };


  // ---------------- LOAD HISTORY (CHART) ----------------
  const loadHistory = async () => {
    if (!fromCoin || !toCoin) return;

    try {
      // hide chart for fiat → fiat
      if (fromCoin.type === "fiat" && toCoin.type === "fiat") return;

      const url = `https://api.coingecko.com/api/v3/coins/${fromCoin.id}/market_chart?vs_currency=${toCoin.symbol.toLowerCase()}&days=${range}`;

      const res = await axios.get(url);
      const raw = res.data.prices || [];

      const data = raw.map((p: any) => ({
        time: Math.floor(p[0] / 1000),
        value: p[1]
      }));

      if (!chartContainerRef.current) return;

      // cleanup old chart
      if (chartRef.current) {
        chartRef.current.remove();
      }

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 320,
        layout: {
          background: { type: ColorType.Solid, color: "#ffffff" },
          textColor: "#111",
        },
        grid: {
          vertLines: { color: "#eee" },
          horzLines: { color: "#eee" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        timeScale: { borderColor: "#ddd" },
        rightPriceScale: { borderColor: "#ddd" }
      });

      const area = chart.addAreaSeries({
        topColor: "rgba(59,130,246,0.35)",
        bottomColor: "rgba(59,130,246,0.05)",
        lineColor: "#3b82f6",
        lineWidth: 2,
      });

      area.setData(data);

      chartRef.current = chart;
      seriesRef.current = area;
    } catch (err) {
      console.error("Chart error", err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [fromCoin, toCoin, range]);


  return (
    <div className="max-w-4xl mx-auto p-6">

      {/* AMOUNT */}
      <h3 className="text-xl font-bold">AMOUNT</h3>
      <input
        value={amount}
        onChange={(e) => handleAmount(e.target.value)}
        className="w-full p-4 border rounded-lg text-lg mt-2"
      />

      {/* FROM */}
      <h3 className="text-xl font-bold mt-8">FROM</h3>

      <div className="relative mt-2">
        <div
          className="border p-4 rounded-lg flex items-center justify-between cursor-pointer"
          onClick={() => setOpenDropdown(openDropdown === "from" ? null : "from")}
        >
          <div className="flex items-center gap-3">
            {fromCoin && (
              <img
                src={fromCoin.image}
                className="rounded-full"
                style={{ width: fromCoin.type === "fiat" ? 32 : 32, height: fromCoin.type === "fiat" ? 24 : 32 }}
              />
            )}
            <span className="font-semibold">{fromCoin?.symbol}</span>
          </div>
          <span>▼</span>
        </div>

        {openDropdown === "from" && (
          <div
            ref={panelRef}
            className="absolute w-full bg-white border rounded-lg mt-2 max-h-80 overflow-y-scroll z-20"
          >
            <input
              className="w-full p-3 border-b"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {filtered.map((coin) => (
              <div
                key={coin.id}
                onClick={() => applySelection(coin, "from")}
                className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 ${
                  toCoin?.id === coin.id ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                <img
                  src={coin.image}
                  className="rounded-full"
                  style={{ width: coin.type === "fiat" ? 32 : 32, height: coin.type === "fiat" ? 24 : 32 }}
                />
                <span className="font-semibold">{coin.symbol}</span>
                <span className="text-gray-500">{coin.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SWAP BUTTON */}
      <div className="flex justify-center my-6">
        <button
          onClick={swapCoins}
          className="p-4 border rounded-full hover:bg-gray-100 transition"
        >
          ↕
        </button>
      </div>

      {/* TO */}
      <h3 className="text-xl font-bold">TO</h3>

      <div className="relative mt-2">
        <div
          className="border p-4 rounded-lg flex items-center justify-between cursor-pointer"
          onClick={() => setOpenDropdown(openDropdown === "to" ? null : "to")}
        >
          <div className="flex items-center gap-3">
            {toCoin && (
              <img
                src={toCoin.image}
                className="rounded-full"
                style={{ width: toCoin.type === "fiat" ? 32 : 32, height: toCoin.type === "fiat" ? 24 : 32 }}
              />
            )}
            <span className="font-semibold">{toCoin?.symbol}</span>
          </div>
          <span>▼</span>
        </div>

        {openDropdown === "to" && (
          <div
            ref={panelRef}
            className="absolute w-full bg-white border rounded-lg mt-2 max-h-80 overflow-y-scroll z-20"
          >
            <input
              className="w-full p-3 border-b"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {filtered.map((coin) => (
              <div
                key={coin.id}
                onClick={() => applySelection(coin, "to")}
                className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-100 ${
                  fromCoin?.id === coin.id ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                <img
                  src={coin.image}
                  className="rounded-full"
                  style={{ width: coin.type === "fiat" ? 32 : 32, height: coin.type === "fiat" ? 24 : 32 }}
                />
                <span className="font-semibold">{coin.symbol}</span>
                <span className="text-gray-500">{coin.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RESULT */}
      {result !== null && !isInvalid && fromCoin && toCoin && (
        <div className="text-center mt-10">
          <div className="text-xl opacity-60">
            {amount} {fromCoin.symbol} →
          </div>

          <div className="text-6xl font-bold mt-2">
            {result.toFixed(6)} {toCoin.symbol}
          </div>

          <div className="text-gray-500 text-lg mt-2">
            1 {fromCoin.symbol} = {(result / Number(amount)).toFixed(6)} {toCoin.symbol}
            <br />
            1 {toCoin.symbol} = {(1 / (result / Number(amount))).toFixed(6)} {fromCoin.symbol}
          </div>
        </div>
      )}

      {/* SPACE */}
      <div className="my-10"></div>

      {/* CHART TITLE */}
      {fromCoin && toCoin && (
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">
            {fromCoin.symbol} to {toCoin.symbol} Price Chart
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Historical price of {fromCoin.name} expressed in {toCoin.name}
          </p>
        </div>
      )}

      {/* RANGE BUTTONS */}
      <div className="flex justify-center gap-2 mb-4">
        {[
          { d: "1", t: "24H" },
          { d: "7", t: "7D" },
          { d: "30", t: "1M" },
          { d: "90", t: "3M" },
          { d: "180", t: "6M" },
          { d: "365", t: "1Y" },
        ].map((r) => (
          <button
            key={r.d}
            onClick={() => setRange(r.d)}
            className={`px-3 py-1 border rounded ${
              range === r.d ? "bg-gray-200" : "bg-white"
            }`}
          >
            {r.t}
          </button>
        ))}
      </div>

      {/* CHART */}
      <div
        ref={chartContainerRef}
        className="w-full h-[320px] border rounded-lg"
      ></div>
    </div>
  );
}
