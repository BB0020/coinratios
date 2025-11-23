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

  const [fromCoin, setFromCoin] = useState<Item | null>(null);
  const [toCoin, setToCoin] = useState<Item | null>(null);

  const [result, setResult] = useState<number | null>(null);

  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);

  // Load coins
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

        // Default values (BTC → USD)
        const defaultFrom: Item | null =
          cryptoItems.find((c: any) => c.symbol === "BTC") || null;

        const defaultTo: Item | null =
          fiatList.find((f: Item) => f.symbol === "USD") || null;

        setFromCoin(defaultFrom);
        setToCoin(defaultTo);
      })
      .catch(console.error);
  }, []);

  // Filter list
  useEffect(() => {
    if (!search) {
      setFiltered(allCoins);
      return;
    }

    const s = search.toLowerCase();
    setFiltered(
      allCoins.filter(
        (c: Item) =>
          c.name.toLowerCase().includes(s) ||
          c.symbol.toLowerCase().includes(s)
      )
    );
  }, [search, allCoins]);

  // Calculate conversion
  useEffect(() => {
    if (!fromCoin || !toCoin || !amount) return;

    const fetchRate = async () => {
      const res = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${fromCoin.id},${toCoin.id}&vs_currencies=usd`
      );

      const fromUSD = res.data[fromCoin.id]?.usd;
      const toUSD = res.data[toCoin.id]?.usd;

      if (!fromUSD || !toUSD) return;

      const value = (Number(amount) * fromUSD) / toUSD;
      setResult(value);
    };

    fetchRate();
  }, [fromCoin, toCoin, amount]);

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

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      {/* AMOUNT */}
      <h3>AMOUNT</h3>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{
          width: "420px",
          padding: "18px",
          borderRadius: "12px",
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
          fontSize: "22px",
          marginBottom: "26px",
        }}
      />

      <div style={{ display: "flex", gap: "26px", alignItems: "center" }}>
        {/* FROM */}
        <div>
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
                placeholder="Search all..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {filtered.map((coin: Item) => (
                <div
                  key={coin.id}
                  className="dropdown-row"
                  onClick={() => applySelection(coin, "from")}
                >
                  <img className="dropdown-flag" src={coin.image} />
                  <span className="dropdown-symbol">{coin.symbol}</span>
                  {coin.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SWAP BUTTON */}
        <div className="swap-circle" onClick={swapCoins}>
          <div className="swap-icon" />
        </div>

        {/* TO */}
        <div>
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
            <div className="dropdown-panel">
              <input
                className="dropdown-search"
                placeholder="Search all..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {filtered.map((coin: Item) => (
                <div
                  key={coin.id}
                  className="dropdown-row"
                  onClick={() => applySelection(coin, "to")}
                >
                  <img className="dropdown-flag" src={coin.image} />
                  <span className="dropdown-symbol">{coin.symbol}</span>
                  {coin.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RESULT */}
      {result !== null && fromCoin && toCoin && (
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
