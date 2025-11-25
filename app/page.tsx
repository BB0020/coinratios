// ========================
// UpdatedPage.tsx FULL FILE
// Converter UI + Ratio Chart + Time Ranges
// Modern layout, gradient area, curved line
// ========================

"use client";

import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { createChart, ColorType, Time } from "lightweight-charts";

// ----------- Types -----------
interface Item {
  id: string;
  symbol: string;
  name: string;
  type: "crypto" | "fiat";
  image: string;
}

const fiatList: Item[] = [
  { id: "usd", symbol: "USD", name: "US Dollar", type: "fiat", image: "https://flagcdn.com/us.svg" },
  { id: "eur", symbol: "EUR", name: "Euro", type: "fiat", image: "https://flagcdn.com/eu.svg" },
  { id: "gbp", symbol: "GBP", name: "British Pound", type: "fiat", image: "https://flagcdn.com/gb.svg" },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar", type: "fiat", image: "https://flagcdn.com/ca.svg" },
  { id: "aud", symbol: "AUD", name: "Australian Dollar", type: "fiat", image: "https://flagcdn.com/au.svg" },
];

// ----------- Component -----------
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

  // Chart
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [range, setRange] = useState("1M");

  // Time range buttons
  const rangeDays: any = {
    "24H": 1,
    "7D": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    "ALL": "max",
  };
  // =========================
  // Close dropdown on click outside
  // =========================
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // =========================
  // Load crypto list
  // =========================
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      )
      .then((res) => {
        const crypto: Item[] = res.data.map((c: any) => ({
          id: c.id,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          type: "crypto",
          image: c.image,
        }));

        setAllCoins([...fiatList, ...crypto]);

        // Default picks
        setFromCoin(crypto.find((c) => c.symbol === "BTC") || null);
        setToCoin(fiatList.find((f) => f.symbol === "USD") || null);
      });
  }, []);

  // =========================
  // Filter dropdown options
  // =========================
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

  // =========================
  // Input handler
  // =========================
  const handleAmount = (v: string) => {
    if (/^[0-9]*\.?[0-9]*$/.test(v)) {
      setAmount(v);
      setIsInvalid(!v || Number(v) <= 0);
    }
  };

  // =========================
  // Conversion Logic
  // =========================
  const fetchRate = async () => {
    if (!fromCoin || !toCoin) return;

    const amt = Number(amount);
    if (amt <= 0) return setResult(null);

    const from = fromCoin;
    const to = toCoin;

    // 1 — FIAT → FIAT
    if (from.type === "fiat" && to.type === "fiat") {
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=${from.symbol}&to=${to.symbol}`
      );
      return setResult(amt * fx.data?.rates?.[to.symbol]);
    }

    // 2 — CRYPTO → USD
    if (from.type === "crypto" && to.symbol === "USD") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      return setResult(amt * cg.data?.[from.id]?.usd);
    }

    // 3 — USD → CRYPTO
    if (from.symbol === "USD" && to.type === "crypto") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      return setResult(amt / cg.data?.[to.id]?.usd);
    }

    // 4 — CRYPTO → FIAT
    if (from.type === "crypto" && to.type === "fiat") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=USD&to=${to.symbol}`
      );
      return setResult(amt * cg.data?.[from.id]?.usd * fx.data?.rates?.[to.symbol]);
    }

    // 5 — FIAT → CRYPTO
    if (from.type === "fiat" && to.type === "crypto") {
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=${from.symbol}&to=USD`
      );
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      return setResult((amt * fx.data?.rates?.USD) / cg.data?.[to.id]?.usd);
    }

    // 6 — CRYPTO → CRYPTO
    if (from.type === "crypto" && to.type === "crypto") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id},${to.id}&vs_currencies=usd`
      );
      const fromUSD = cg.data?.[from.id]?.usd;
      const toUSD = cg.data?.[to.id]?.usd;
      return setResult((amt * fromUSD) / toUSD);
    }
  };

  // Auto-refresh every 10s
  useEffect(() => {
    fetchRate();
    const t = setInterval(fetchRate, 10000);
    return () => clearInterval(t);
  }, [fromCoin, toCoin, amount]);

  // Swap
  const swapCoins = () => {
    if (!fromCoin || !toCoin) return;
    const temp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(temp);
  };

  // Dropdown apply
  const applySelection = (coin: Item, side: "from" | "to") => {
    if (side === "from") setFromCoin(coin);
    else setToCoin(coin);

    setSearch("");
    setOpenDropdown(null);
  };
  // =========================
  // Fetch Ratio History
  // =========================
  const fetchHistory = async () => {
    if (!fromCoin || !toCoin) return;

    const days = rangeDays[range];

    const fromRes = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${fromCoin.id}/market_chart?vs_currency=usd&days=${days}`
    );
    const toRes = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${toCoin.id}/market_chart?vs_currency=usd&days=${days}`
    );

    const fromPrices = fromRes.data.prices;
    const toPrices = toRes.data.prices;

    const series = fromPrices
      .map((p: any, i: number) => {
        if (!toPrices[i]) return null;
        return {
          time: Math.floor(p[0] / 1000),
          value: p[1] / toPrices[i][1],
        };
      })
      .filter(Boolean);

    setChartData(series as any[]);
  };

  // Re-fetch chart when pair or range changes
  useEffect(() => {
    fetchHistory();
  }, [fromCoin, toCoin, range]);

  // =========================
  // Create Chart (gradient, curved line)
  // =========================
  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;

    // Clear previous chart
    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 380,
      layout: {
        background: { color: "#ffffff", type: ColorType.Solid },
        textColor: "#444",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#e6e6e6" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
    });

    // Area series with gradient + smooth line
    const series = chart.addAreaSeries({
      lineColor: "#3b82f6",
      lineWidth: 3,
      topColor: "rgba(59,130,246,0.35)",
      bottomColor: "rgba(59,130,246,0.00)",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    series.setData(chartData);

    // Resize chart responsively
    const handleResize = () => {
      chart.applyOptions({ width: chartRef.current!.clientWidth });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [chartData]);
  // =========================
  // UI — Converter Section
  // =========================

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "20px",
      }}
    >
      {/* AMOUNT INPUT */}
      <h3>AMOUNT</h3>
      <input
        value={amount}
        onChange={(e) => handleAmount(e.target.value)}
        style={{
          width: "420px",
          padding: "18px",
          borderRadius: "12px",
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
          fontSize: "22px",
          marginBottom: "6px",
        }}
      />

      {isInvalid && (
        <div
          style={{
            color: "red",
            fontSize: "14px",
            marginBottom: "20px",
          }}
        >
          Enter a Number Greater than 0
        </div>
      )}

      {/* FROM — SWAP — TO */}
      <div
        style={{
          display: "flex",
          gap: "26px",
          alignItems: "center",
        }}
      >
        {/* FROM */}
        <div style={{ position: "relative" }}>
          <h3>FROM</h3>

          <div
            className="selector-box"
            onClick={() =>
              setOpenDropdown(openDropdown === "from" ? null : "from")
            }
          >
            {fromCoin && (
              <>
                <img className="selector-img" src={fromCoin.image} />
                <div>
                  <div className="selector-symbol">{fromCoin.symbol}</div>
                  <div className="selector-name">{fromCoin.name}</div>
                </div>
              </>
            )}
          </div>

          {openDropdown === "from" && (
            <div className="dropdown-panel" ref={panelRef}>
              <input
                className="dropdown-search"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {filtered.map((coin) => {
                const disabled = toCoin?.id === coin.id;
                return (
                  <div
                    key={coin.id}
                    className={`dropdown-row ${
                      disabled ? "dropdown-disabled" : ""
                    }`}
                    onClick={() => !disabled && applySelection(coin, "from")}
                  >
                    <img className="dropdown-flag" src={coin.image} />
                    <span className="dropdown-symbol">{coin.symbol}</span>
                    {coin.name}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SWAP BUTTON */}
        <div className="swap-circle" onClick={swapCoins}>
          <div className="swap-icon"></div>
        </div>

        {/* TO */}
        <div style={{ position: "relative" }}>
          <h3>TO</h3>

          <div
            className="selector-box"
            onClick={() => setOpenDropdown(openDropdown === "to" ? null : "to")}
          >
            {toCoin && (
              <>
                <img className="selector-img" src={toCoin.image} />
                <div>
                  <div className="selector-symbol">{toCoin.symbol}</div>
                  <div className="selector-name">{toCoin.name}</div>
                </div>
              </>
            )}
          </div>

          {openDropdown === "to" && (
            <div className="dropdown-panel" ref={panelRef}>
              <input
                className="dropdown-search"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {filtered.map((coin) => {
                const disabled = fromCoin?.id === coin.id;
                return (
                  <div
                    key={coin.id}
                    className={`dropdown-row ${
                      disabled ? "dropdown-disabled" : ""
                    }`}
                    onClick={() => !disabled && applySelection(coin, "to")}
                  >
                    <img className="dropdown-flag" src={coin.image} />
                    <span className="dropdown-symbol">{coin.symbol}</span>
                    {coin.name}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RESULT */}
      {result !== null && !isInvalid && fromCoin && toCoin && (
        <div
          style={{
            textAlign: "center",
            marginTop: "40px",
          }}
        >
          <div
            style={{
              fontSize: "22px",
              opacity: 0.7,
            }}
          >
            {`1 ${fromCoin.symbol} → ${toCoin.symbol}`}
          </div>

          <div
            style={{
              fontSize: "70px",
              fontWeight: 700,
              marginTop: "10px",
            }}
          >
            {result.toFixed(4)} {toCoin.symbol}
          </div>

          <div
            style={{
              opacity: 0.6,
              marginTop: "10px",
              fontSize: "22px",
            }}
          >
            {`1 ${fromCoin.symbol} = ${(
              result / Number(amount)
            ).toFixed(6)} ${toCoin.symbol}`}
            <br />
            {`1 ${toCoin.symbol} = ${(
              1 / (result / Number(amount))
            ).toFixed(6)} ${fromCoin.symbol}`}
          </div>
        </div>
      )}
      {/* ========================= */}
      {/* CHART TITLE + TIME RANGES */}
      {/* ========================= */}

      {fromCoin && toCoin && (
        <div style={{ marginTop: "80px", paddingBottom: "140px" }}>
          <h2
            style={{
              textAlign: "center",
              marginBottom: "25px",
              fontWeight: 600,
            }}
          >
            {`${fromCoin.symbol} to ${toCoin.symbol} — Historical Ratio`}
          </h2>

          {/* TIME RANGE BUTTONS */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "10px",
              marginBottom: "20px",
              flexWrap: "wrap",
            }}
          >
            {["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"].map((r) => {
              const selected = r === range;

              return (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "1px solid #ddd",
                    cursor: "pointer",
                    background: selected
                      ? "linear-gradient(135deg, #3b82f6, #60a5fa)"
                      : "#f8f9fb",
                    color: selected ? "white" : "#444",
                    fontWeight: selected ? 600 : 400,
                    transition: "0.2s",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>

          {/* ========================= */}
          {/* CHART CONTAINER */}
          {/* ========================= */}
          <div
            ref={chartRef}
            style={{
              width: "100%",
              height: "380px",
              borderRadius: "12px",
              border: "1px solid #e2e2e2",
              background: "#ffffff",
            }}
          ></div>
        </div>
      )}
    </div>
  );
}
