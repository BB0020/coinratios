"use client";

import { useEffect, useState, useRef } from "react";
import axios from "axios";

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
    axios.get(
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

      setFromCoin(cryptoItems.find((c) => c.symbol === "BTC") || null);
      setToCoin(fiatList.find((f) => f.symbol === "USD") || null);
    })
    .catch(console.error);
  }, []);

  /* Filter list */
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

  /* Numeric input validation */
  const handleAmount = (v: string) => {
    if (/^[0-9]*\.?[0-9]*$/.test(v)) {
      setAmount(v);
      setIsInvalid(!v || Number(v) <= 0);
    }
  };


  /* =========================================================================
     SMART UNIFIED RATE FUNCTION — FIXES ALL NaN PROBLEMS
     ========================================================================= */
  const fetchRate = async () => {
    if (!fromCoin || !toCoin) return;
    if (isInvalid || Number(amount) <= 0) {
      setResult(null);
      return;
    }

    const from = fromCoin;
    const to = toCoin;

    /* -------------------- 1. Fiat → Fiat --------------------- */
    if (from.type === "fiat" && to.type === "fiat") {
      const fx = await axios.get(
        `https://api.exchangerate.host/convert?from=${from.symbol}&to=${to.symbol}`
      );
      setResult(Number(amount) * fx.data.result);
      return;
    }

    /* -------------------- 2. Crypto → USD --------------------- */
    if (from.type === "crypto" && to.symbol === "USD") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      const price = cg.data[from.id]?.usd;
      if (!price) return setResult(null);
      setResult(Number(amount) * price);
      return;
    }

    /* -------------------- 3. USD → Crypto --------------------- */
    if (from.symbol === "USD" && to.type === "crypto") {
      // 1) USD → USD (trivial = 1)
      const usdToUSD = 1;

      // 2) USD price of crypto (CoinGecko)
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      const cryptoUSD = cg.data[to.id]?.usd;
      if (!cryptoUSD) return setResult(null);

      // USD amount divided by USD price of crypto
      setResult(Number(amount) / cryptoUSD);
      return;
    }

    /* -------------------- 4. Crypto → Fiat (non-USD) ---------- */
    if (from.type === "crypto" && to.type === "fiat") {
      // 1) Crypto → USD
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=usd`
      );
      const cryptoUSD = cg.data[from.id]?.usd;
      if (!cryptoUSD) return setResult(null);

      // 2) USD → target fiat
      const fx = await axios.get(
        `https://api.exchangerate.host/convert?from=USD&to=${to.symbol}`
      );
      const usdToFiat = fx.data.result;

      setResult(Number(amount) * cryptoUSD * usdToFiat);
      return;
    }

    /* -------------------- 5. Fiat → Crypto -------------------- */
    if (from.type === "fiat" && to.type === "crypto") {
      // 1) Fiat → USD
      const fx = await axios.get(
        `https://api.exchangerate.host/convert?from=${from.symbol}&to=USD`
      );
      const fiatToUSD = fx.data.result;

      // 2) USD → Crypto (CoinGecko)
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${to.id}&vs_currencies=usd`
      );
      const cryptoUSD = cg.data[to.id]?.usd;

      setResult((Number(amount) * fiatToUSD) / cryptoUSD);
      return;
    }

    /* -------------------- 6. Crypto → Crypto ------------------ */
    if (from.type === "crypto" && to.type === "crypto") {
      const cg = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${from.id},${to.id}&vs_currencies=usd`
      );

      const fromUSD = cg.data[from.id]?.usd;
      const toUSD = cg.data[to.id]?.usd;

      if (!fromUSD || !toUSD) return setResult(null);

      setResult((Number(amount) * fromUSD) / toUSD);
      return;
    }
  };

  /* Auto-refresh every 10s */
  useEffect(() => {
    fetchRate();
    const timer = setInterval(fetchRate, 10000);
    return () => clearInterval(timer);
  }, [fromCoin, toCoin, amount]);


  /* Clicking a dropdown row */
  const applySelection = (coin: Item, side: "from" | "to") => {
    if (side === "from") setFromCoin(coin);
    else setToCoin(coin);

    setOpenDropdown(null);
    setSearch("");
  };

  const swapCoins = () => {
    if (!fromCoin || !toCoin) return;
    const temp = fromCoin;
    setFromCoin(toCoin);
    setToCoin(temp);
  };


  /* ---------------- UI ------------------ */

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>

      {/* AMOUNT */}
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
                    className={
                      "dropdown-row " + (disabled ? "dropdown-disabled" : "")
                    }
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
            onClick={() =>
              setOpenDropdown(openDropdown === "to" ? null : "to")
            }
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
                    className={
                      "dropdown-row " + (disabled ? "dropdown-disabled" : "")
                    }
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
            {`1 ${fromCoin.symbol} = ${(result / Number(amount)).toFixed(
              6
            )} ${toCoin.symbol}`}
            <br />
            {`1 ${toCoin.symbol} = ${(
              1 /
              (result / Number(amount))
            ).toFixed(6)} ${fromCoin.symbol}`}
          </div>
        </div>
      )}

    </div>
  );
}
