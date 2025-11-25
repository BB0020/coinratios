"use client";

import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { createChart, ColorType } from "lightweight-charts";

/* ========================= TYPES ========================= */

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

/* ========================= COMPONENT ========================= */

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

  /* Chart */
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  /* ========================= EFFECTS ========================= */

  /* Close dropdown */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Load crypto list */
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
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

        setFromCoin(cryptoItems.find((c) => c.symbol === "BTC") || null);
        setToCoin(fiatList.find((f) => f.symbol === "USD") || null);
      })
      .catch(console.error);
  }, []);

  /* Filter dropdown */
  useEffect(() => {
    if (!search) {
      setFiltered(allCoins);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      allCoins.filter(
        (c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
      )
    );
  }, [search, allCoins]);

  /* ========================= HANDLERS ========================= */

  const handleAmount = (v: string) => {
    if (/^[0-9]*\.?[0-9]*$/.test(v)) {
      setAmount(v);
      setIsInvalid(!v || Number(v) <= 0);
    }
  };

  /* Conversion */
  const fetchRate = async () => {
    if (!fromCoin || !toCoin) return;
    if (isInvalid || Number(amount) <= 0) {
      setResult(null);
      return;
    }

    const from = fromCoin;
    const to = toCoin;

    /* 1. FIAT→FIAT */
    if (from.type === "fiat" && to.type === "fiat") {
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=${from.symbol}&to=${to.symbol}`
      );
      const rate = fx.data?.rates?.[to.symbol];
      if (!rate) return setResult(null);
      setResult(Number(amount) * rate);
      return;
    }

    /* 2. CRYPTO→USD */
    if (from.type === "crypto" && to.symbol === "USD") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      setResult(Number(amount) * cg.data?.[from.id]?.usd);
      return;
    }

    /* 3. USD→CRYPTO */
    if (from.symbol === "USD" && to.type === "crypto") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      setResult(Number(amount) / cg.data?.[to.id]?.usd);
      return;
    }

    /* 4. CRYPTO→FIAT */
    if (from.type === "crypto" && to.type === "fiat") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=USD&to=${to.symbol}`
      );
      setResult(Number(amount) * cg.data?.[from.id]?.usd * fx.data?.rates?.[to.symbol]);
      return;
    }

    /* 5. FIAT→CRYPTO */
    if (from.type === "fiat" && to.type === "crypto") {
      const fx = await axios.get(
        `https://api.frankfurter.app/latest?from=${from.symbol}&to=USD`
      );
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      setResult((Number(amount) * fx.data?.rates?.USD) / cg.data?.[to.id]?.usd);
      return;
    }

    /* 6. CRYPTO→CRYPTO */
    if (from.type === "crypto" && to.type === "crypto") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id},${to.id}&vs_currencies=usd`
      );
      const fromUSD = cg.data?.[from.id]?.usd;
      const toUSD = cg.data?.[to.id]?.usd;
      if (!fromUSD || !toUSD) return;
      setResult((Number(amount) * fromUSD) / toUSD);
      return;
    }
  };

  /* Auto-refresh */
  useEffect(() => {
    fetchRate();
    const timer = setInterval(fetchRate, 10000);
    return () => clearInterval(timer);
  }, [fromCoin, toCoin, amount]);

  /* Apply dropdown */
  const applySelection = (coin: Item, side: "from" | "to") => {
    if (side === "from") setFromCoin(coin);
    else setToCoin(coin);
    setOpenDropdown(null);
    setSearch("");
  };

  /* Swap */
  const swapCoins = () => {
    if (!fromCoin || !toCoin) return;
    const tmp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(tmp);
  };

  /* ========================= HISTORICAL RATIO CHART ========================= */

  const fetchRatioHistory = async () => {
    if (!fromCoin || !toCoin) return;

    const days = 30;

    const fromRes = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${fromCoin.id}/market_chart?vs_currency=usd&days=${days}`
    );

    const toRes = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${toCoin.id}/market_chart?vs_currency=usd&days=${days}`
    );

    const fromPrices = fromRes.data.prices;
    const toPrices = toRes.data.prices;

    const ratioSeries = fromPrices
      .map((p: any, i: number) => {
        const ts = Math.floor(p[0] / 1000);
        const fromVal = p[1];
        const toVal = toPrices[i]?.[1];
        if (!toVal) return null;
        return { time: ts, value: fromVal / toVal };
      })
      .filter(Boolean);

    setChartData(ratioSeries as any[]);
  };

  useEffect(() => {
    fetchRatioHistory();
  }, [fromCoin, toCoin]);

  /* Render chart */
  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;

    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#eee" },
        horzLines: { color: "#eee" },
      },
    });

    const line = chart.addLineSeries({
      color: "#3b82f6",
      lineWidth: 2,
    });

    line.setData(chartData);

    const resize = () => {
      chart.applyOptions({ width: chartRef.current!.clientWidth });
    };
    window.addEventListener("resize", resize);

    return () => window.removeEventListener("resize", resize);
  }, [chartData]);

  /* ========================= UI ========================= */

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
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
        <div style={{ color: "red", fontSize: "14px", marginBottom: "20px" }}>
          Enter a Number Greater than 0
        </div>
      )}

      <div style={{ display: "flex", gap: "26px", alignItems: "center" }}>
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
                    className={"dropdown-row " + (disabled ? "dropdown-disabled" : "")}
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

        {/* SWAP */}
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
                    className={"dropdown-row " + (disabled ? "dropdown-disabled" : "")}
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
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <div style={{ fontSize: "22px", opacity: 0.7 }}>
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
            {`1 ${fromCoin.symbol} = ${(result / Number(amount)).toFixed(6)} ${
              toCoin.symbol
            }`}
            <br />
            {`1 ${toCoin.symbol} = ${(
              1 /
              (result / Number(amount))
            ).toFixed(6)} ${fromCoin.symbol}`}
          </div>
        </div>
      )}

      {/* CHART */}
      {fromCoin && toCoin && (
        <div style={{ marginTop: "80px", paddingBottom: "120px" }}>
          <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
            {`${fromCoin.symbol} to ${toCoin.symbol} Chart — Historical price of ${fromCoin.name} expressed in ${toCoin.symbol}`}
          </h2>

          <div
            ref={chartRef}
            style={{
              width: "100%",
              height: "380px",
              borderRadius: "12px",
              border: "1px solid #ddd",
              background: "#fff",
            }}
          />
        </div>
      )}
    </div>
  );
}
