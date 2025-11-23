"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";

// Fiat currencies injected as virtual coins
const fiatCurrencies = [
  { id: "usd", symbol: "usd", name: "US Dollar", flag: "🇺🇸" },
  { id: "eur", symbol: "eur", name: "Euro", flag: "🇪🇺" },
  { id: "gbp", symbol: "gbp", name: "British Pound", flag: "🇬🇧" },
  { id: "cad", symbol: "cad", name: "Canadian Dollar", flag: "🇨🇦" },
  { id: "aud", symbol: "aud", name: "Australian Dollar", flag: "🇦🇺" },
  { id: "jpy", symbol: "jpy", name: "Japanese Yen", flag: "🇯🇵" },
  { id: "chf", symbol: "chf", name: "Swiss Franc", flag: "🇨🇭" },
];

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image?: string; // crypto coins
  flag?: string; // fiat
}

export default function Home() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinA, setCoinA] = useState<Coin | null>(null);
  const [coinB, setCoinB] = useState<Coin | null>(null);
  const [dropdown, setDropdown] = useState<"A" | "B" | null>(null);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [amount, setAmount] = useState("1.00");
  const [ratio, setRatio] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Load crypto + inject fiat
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200"
      )
      .then((res) => {
        const crypto = res.data.map((c: any) => ({
          id: c.id,
          symbol: c.symbol,
          name: c.name,
          image: c.image,
        }));

        setCoins([...fiatCurrencies, ...crypto]);
      });
  }, []);

  // Default selection = BTC → USD
  useEffect(() => {
    const btc = coins.find((c) => c.id === "bitcoin");
    const usd = coins.find((c) => c.id === "usd");
    if (btc && usd) {
      setCoinA(btc);
      setCoinB(usd);
    }
  }, [coins]);

  // Calculate ratio
  useEffect(() => {
    if (!coinA || !coinB) return;

    axios
      .get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinA.id}&vs_currencies=${coinB.id}`
      )
      .then((res) => {
        const value = res.data?.[coinA.id]?.[coinB.id];
        if (value) setRatio(value);
      });
  }, [coinA, coinB]);

  // Filtered coin lists
  const listA = coins.filter((c) =>
    `${c.name} ${c.symbol}`
      .toLowerCase()
      .includes(searchA.toLowerCase())
  );

  const listB = coins.filter((c) =>
    `${c.name} ${c.symbol}`
      .toLowerCase()
      .includes(searchB.toLowerCase())
  );

  return (
    <div ref={wrapperRef} style={{ padding: 30, maxWidth: 900, margin: "0 auto" }}>
      <h1>CoinRatios</h1>

      {/* TOP GRID */}
      <div className="top-grid">
        {/* AMOUNT */}
        <div className="card-coin">
          <label className="label">AMOUNT</label>
          <input
            className="amount-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {(!amount || isNaN(Number(amount)) || Number(amount) <= 0) && (
            <div className="amount-error">
              Amount needs to be a number and greater than 0.
            </div>
          )}
        </div>

        {/* FROM */}
        <div className="card-coin">
          <label className="label">FROM</label>

          <div
            className="dropdown-box"
            onClick={() => setDropdown(dropdown === "A" ? null : "A")}
          >
            {coinA ? (
              <>
                {coinA.flag ? (
                  <span className="flag-icon">{coinA.flag}</span>
                ) : (
                  <img src={coinA.image} width={32} height={32} />
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{coinA.symbol.toUpperCase()}</div>
                  <div style={{ opacity: 0.6 }}>{coinA.name}</div>
                </div>
              </>
            ) : (
              <span className="placeholder">Select Coin</span>
            )}
          </div>

          {dropdown === "A" && (
            <div className="dropdown-panel">
              <input
                className="dropdown-search"
                placeholder="Search all…"
                value={searchA}
                onChange={(e) => setSearchA(e.target.value)}
              />

              {listA.map((coin) => (
                <div
                  key={coin.id}
                  className="dropdown-item"
                  onClick={() => {
                    setCoinA(coin);
                    setDropdown(null);
                    setSearchA("");
                  }}
                >
                  {coin.flag ? (
                    <span className="flag-icon">{coin.flag}</span>
                  ) : (
                    <img src={coin.image} width={24} height={24} />
                  )}
                  {coin.name} ({coin.symbol.toUpperCase()})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SWAP */}
        <div className="swap-wrap">
          <button
            className="swap-btn"
            onClick={() => {
              const old = coinA;
              setCoinA(coinB);
              setCoinB(old);
            }}
          >
            ⇆
          </button>
        </div>

        {/* TO */}
        <div className="card-coin">
          <label className="label">TO</label>

          <div
            className="dropdown-box"
            onClick={() => setDropdown(dropdown === "B" ? null : "B")}
          >
            {coinB ? (
              <>
                {coinB.flag ? (
                  <span className="flag-icon">{coinB.flag}</span>
                ) : (
                  <img src={coinB.image} width={32} height={32} />
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{coinB.symbol.toUpperCase()}</div>
                  <div style={{ opacity: 0.6 }}>{coinB.name}</div>
                </div>
              </>
            ) : (
              <span className="placeholder">Select Coin</span>
            )}
          </div>

          {dropdown === "B" && (
            <div className="dropdown-panel">
              <input
                className="dropdown-search"
                placeholder="Search all…"
                value={searchB}
                onChange={(e) => setSearchB(e.target.value)}
              />

              {listB.map((coin) => (
                <div
                  key={coin.id}
                  className="dropdown-item"
                  onClick={() => {
                    setCoinB(coin);
                    setDropdown(null);
                    setSearchB("");
                  }}
                >
                  {coin.flag ? (
                    <span className="flag-icon">{coin.flag}</span>
                  ) : (
                    <img src={coin.image} width={24} height={24} />
                  )}
                  {coin.name} ({coin.symbol.toUpperCase()})
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RATIO OUTPUT */}
      {ratio && (
        <div className="ratio-box">
          <div className="ratio-sub">
            1 {coinA?.symbol.toUpperCase()} →
          </div>

          <div className="ratio-big">
            {(ratio * Number(amount)).toFixed(4)} {coinB?.symbol.toUpperCase()}
          </div>

          <div className="ratio-sub">
            1 {coinA?.symbol.toUpperCase()} = {ratio.toFixed(6)}{" "}
            {coinB?.symbol.toUpperCase()}
          </div>
          <div className="ratio-sub">
            1 {coinB?.symbol.toUpperCase()} = {(1 / ratio).toFixed(6)}{" "}
            {coinA?.symbol.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
