// UpdatedPage.tsx â€“ FINAL FULL FILE GENERATED SUCCESSFULLY


"use client";

import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { createChart, ColorType } from "lightweight-charts";

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

export default function UpdatedPage() {
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
  const chartRef = useRef<HTMLDivElement | null>(null);

  const [chartData, setChartData] = useState<any[]>([]);
  const [range, setRange] = useState("1M");
  const [theme, setTheme] = useState<"light" | "dark">("light");



  const rangeDays: any = {
    "24H": 1,
    "7D": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    "ALL": "max",
  };

  // MutationObserver for theme toggle
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    });
    obs.observe(document.documentElement, { attributes: true });

    const initDark = document.documentElement.classList.contains("dark");
    setTheme(initDark ? "dark" : "light");

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



  useEffect(() => {
    axios
      .get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1")
      .then((res) => {
        const crypto: Item[] = res.data.map((c: any) => ({
          id: c.id,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          type: "crypto",
          image: c.image,
        }));
        setAllCoins([...fiatList, ...crypto]);
        setFromCoin(crypto.find((c) => c.symbol === "BTC") || null);
        setToCoin(fiatList.find((f) => f.symbol === "USD") || null);
      });
  }, []);

  useEffect(() => {
    if (!search) return setFiltered(allCoins);
    const q = search.toLowerCase();
    setFiltered(
      allCoins.filter(
        (c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
      )
    );
  }, [search, allCoins]);

  const handleAmount = (v: string) => {
    if (/^[0-9]*\.?[0-9]*$/.test(v)) {
      setAmount(v);
      setIsInvalid(!v || Number(v) <= 0);
    }
  };



  const fetchRate = async () => {
    if (!fromCoin || !toCoin) return;
    const amt = Number(amount);
    if (amt <= 0) return setResult(null);

    const from = fromCoin;
    const to = toCoin;

    if (from.type === "fiat" && to.type === "fiat") {
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=${from.symbol}&to=${to.symbol}`
      );
      return setResult(amt * fx.data?.rates?.[to.symbol]);
    }

    if (from.type === "crypto" && to.symbol === "USD") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      return setResult(amt * cg.data?.[from.id]?.usd);
    }

    if (from.symbol === "USD" && to.type === "crypto") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      return setResult(amt / cg.data?.[to.id]?.usd);
    }

    if (from.type === "crypto" && to.type === "fiat") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=USD&to=${to.symbol}`
      );
      return setResult(amt * cg.data?.[from.id]?.usd * fx.data?.rates?.[to.symbol]);
    }

    if (from.type === "fiat" && to.type === "crypto") {
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=${from.symbol}&to=USD`
      );
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      return setResult((amt * fx.data?.rates?.USD) / cg.data?.[to.id]?.usd);
    }

    if (from.type === "crypto" && to.type === "crypto") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id},${to.id}&vs_currencies=usd`
      );
      return setResult(
        (amt * cg.data?.[from.id]?.usd) / cg.data?.[to.id]?.usd
      );
    }
  };

  useEffect(() => {
    fetchRate();
  }, [fromCoin, toCoin, amount]);



  const fetchHistory = async () => {
    if (!fromCoin || !toCoin) return;
    const days = rangeDays[range];

    const [fromRes, toRes] = await Promise.all([
      axios.get(
        `https://api.coingecko.com/api/v3/coins/${fromCoin.id}/market_chart?vs_currency=usd&days=${days}`
      ),
      axios.get(
        `https://api.coingecko.com/api/v3/coins/${toCoin.id}/market_chart?vs_currency=usd&days=${days}`
      ),
    ]);

    const fp = fromRes.data.prices;
    const tp = toRes.data.prices;

    const series = fp
      .map((p: any, i: number) => {
        if (!tp[i]) return null;
        return {
          time: Math.floor(p[0] / 1000),
          value: p[1] / tp[i][1],
        };
      })
      .filter(Boolean);

    setChartData(series as any[]);
  };

  useEffect(() => {
    fetchHistory();
  }, [fromCoin, toCoin, range]);

  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;
    chartRef.current.innerHTML = "";

    const isDark = theme === "dark";

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 380,
      layout: {
        background: { color: isDark ? "#000000" : "#ffffff" },
        textColor: isDark ? "#f0f0f0" : "#333333",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: isDark ? "#1e1e1e" : "#e6e6e6" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const series = chart.addAreaSeries({
      lineColor: isDark ? "#60a5fa" : "#3b82f6",
      lineWidth: 3,
      topColor: isDark ? "rgba(96,165,250,0.35)" : "rgba(59,130,246,0.35)",
      bottomColor: "rgba(0,0,0,0)",
    });

    series.setData(chartData);

    const resize = () => {
      chart.applyOptions({ width: chartRef.current!.clientWidth });
    };

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);



  }, [chartData, theme]);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      <div
        style={{
          display: "flex",
          gap: "20px",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        {/* AMOUNT */}
        <div>
          <h3>AMOUNT</h3>
          <input
            value={amount}
            onChange={(e) => handleAmount(e.target.value)}
            style={{
              width: "200px",
              padding: "14px",
              fontSize: "18px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          {isInvalid && (
            <div style={{ color: "red", fontSize: "14px" }}>
              Enter a Number Greater than 0
            </div>
          )}
        </div>




        {/* FROM */}
        <div style={{ minWidth: "240px" }}>
          <h3>FROM</h3>
          <div
            onClick={() =>
              setOpenDropdown(openDropdown === "from" ? null : "from")
            }
            style={{
              border: "1px solid #ccc",
              padding: "14px",
              borderRadius: "10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "#fafafa",
            }}
          >
            {fromCoin && (
              <>
                <img src={fromCoin.image} style={{ width: "28px" }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{fromCoin.symbol}</div>
                  <div style={{ fontSize: "12px", opacity: 0.7 }}>
                    {fromCoin.name}
                  </div>
                </div>
              </>
            )}
          </div>

          {openDropdown === "from" && (
            <div
              ref={panelRef}
              style={{
                position: "absolute",
                zIndex: 50,
                background: "white",
                border: "1px solid #ddd",
                width: "260px",
                maxHeight: "300px",
                overflowY: "auto",
                borderRadius: "10px",
                marginTop: "6px",
              }}
            >
              <input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderBottom: "1px solid #eee",
                }}
              />
              {filtered.map((coin) => (
                <div
                  key={coin.id}
                  onClick={() => {
                    setFromCoin(coin);
                    setOpenDropdown(null);
                  }}
                  style={{
                    padding: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <img src={coin.image} style={{ width: "22px" }} />
                  <div>{coin.symbol}</div>
                  <div style={{ opacity: 0.6 }}>{coin.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TO */}
        <div style={{ minWidth: "240px" }}>
          <h3>TO</h3>
          <div
            onClick={() => setOpenDropdown(openDropdown === "to" ? null : "to")}
            style={{
              border: "1px solid #ccc",
              padding: "14px",
              borderRadius: "10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              background: "#fafafa",
            }}
          >
            {toCoin && (
              <>
                <img src={toCoin.image} style={{ width: "28px" }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{toCoin.symbol}</div>
                  <div style={{ fontSize: "12px", opacity: 0.7 }}>
                    {toCoin.name}
                  </div>
                </div>
              </>
            )}
          </div>

          {openDropdown === "to" && (
            <div
              ref={panelRef}
              style={{
                position: "absolute",
                zIndex: 50,
                background: "white",
                border: "1px solid #ddd",
                width: "260px",
                maxHeight: "300px",
                overflowY: "auto",
                borderRadius: "10px",
                marginTop: "6px",
              }}
            >
              <input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderBottom: "1px solid #eee",
                }}
              />
              {filtered.map((coin) => (
                <div
                  key={coin.id}
                  onClick={() => {
                    setToCoin(coin);
                    setOpenDropdown(null);
                  }}
                  style={{
                    padding: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <img src={coin.image} style={{ width: "22px" }} />
                  <div>{coin.symbol}</div>
                  <div style={{ opacity: 0.6 }}>{coin.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RESULT */}
      {result !== null && (
        <div style={{ textAlign: "center", marginTop: "30px" }}>
          <div style={{ fontSize: "22px", opacity: 0.7 }}>
            1 {fromCoin?.symbol} â†’ {toCoin?.symbol}
          </div>
          <div style={{ fontSize: "60px", fontWeight: 700, marginTop: "6px" }}>
            {result?.toFixed(6)} {toCoin?.symbol}
          </div>
        </div>
      )}



      {/* RANGE BUTTONS */}
      {fromCoin && toCoin && (
        <div style={{ marginTop: "60px", textAlign: "center" }}>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            {["24H", "7D", "1M", "3M", "6M", "1Y", "ALL"].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: range === r ? "#3b82f6" : "#fff",
                  color: range === r ? "white" : "#444",
                }}
              >
                {r}
              </button>
            ))}
          </div>

          {/* CHART */}
          <div
            ref={chartRef}
            style={{
              width: "100%",
              height: "380px",
              marginTop: "24px",
              borderRadius: "12px",
              border: "1px solid #ddd",
            }}
          />
        </div>
      )}
    </div>
  );
}



// END OF FILE â€” UpdatedPage.tsx fully assembled

