"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
);

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

export default function Home() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [amount, setAmount] = useState("1.00");
  const [coinA, setCoinA] = useState<Coin | null>(null);
  const [coinB, setCoinB] = useState<Coin | null>(null);
  const [showDropdown, setShowDropdown] = useState<"A" | "B" | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200"
      )
      .then((res) => setCoins(res.data));
  }, []);

  useEffect(() => {
    if (!coinA || !coinB) return;

    axios
      .get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinA.id},${coinB.id}&vs_currencies=usd`
      )
      .then((res) => {
        const a = res.data[coinA.id]?.usd;
        const b = res.data[coinB.id]?.usd;
        if (a && b) setRatio(a / b);
      });
  }, [coinA, coinB]);

  const filteredCoins = (search: string) =>
    coins.filter((c) =>
      `${c.name} ${c.symbol}`.toLowerCase().includes(search.toLowerCase())
    );

  // Swap coins
  const swap = () => {
    const oldA = coinA;
    setCoinA(coinB);
    setCoinB(oldA);
  };

  return (
    <div style={{ padding: 30, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 40 }}>CoinRatios</h1>

      {/* --- TOP GRID --- */}
      <div className="top-grid">
        {/* Amount */}
        <div className="card-coin">
          <label className="label">AMOUNT</label>
          <input
            className="amount-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {/* Coin A */}
        <div className="card-coin">
          <label className="label">FROM</label>

          <div
            className="dropdown-box"
            onClick={() => setShowDropdown(showDropdown === "A" ? null : "A")}
          >
            {coinA ? (
              <>
                <img src={coinA.image} className="coin-icon" />
                <div>
                  <div className="coin-symbol">{coinA.symbol.toUpperCase()}</div>
                  <div className="coin-name">{coinA.name}</div>
                </div>
              </>
            ) : (
              <div className="placeholder">Select Coin</div>
            )}
          </div>

          {showDropdown === "A" && (
            <div className="dropdown-list">
              {filteredCoins("").map((coin) => (
                <div
                  key={coin.id}
                  className="dropdown-item"
                  onClick={() => {
                    setCoinA(coin);
                    setShowDropdown(null);
                  }}
                >
                  <img src={coin.image} className="coin-icon" />
                  {coin.name} ({coin.symbol.toUpperCase()})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Swap Button */}
        <div className="swap-wrap">
          <button className="swap-btn" onClick={swap}>
            ⇆
          </button>
        </div>

        {/* Coin B */}
        <div className="card-coin">
          <label className="label">TO</label>

          <div
            className="dropdown-box"
            onClick={() => setShowDropdown(showDropdown === "B" ? null : "B")}
          >
            {coinB ? (
              <>
                <img src={coinB.image} className="coin-icon" />
                <div>
                  <div className="coin-symbol">{coinB.symbol.toUpperCase()}</div>
                  <div className="coin-name">{coinB.name}</div>
                </div>
              </>
            ) : (
              <div className="placeholder">Select Coin</div>
            )}
          </div>

          {showDropdown === "B" && (
            <div className="dropdown-list">
              {filteredCoins("").map((coin) => (
                <div
                  key={coin.id}
                  className="dropdown-item"
                  onClick={() => {
                    setCoinB(coin);
                    setShowDropdown(null);
                  }}
                >
                  <img src={coin.image} className="coin-icon" />
                  {coin.name} ({coin.symbol.toUpperCase()})
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RATIO RESULT */}
      {ratio && coinA && coinB && (
        <div className="ratio-box">
          <div className="ratio-label">
            1 {coinA.symbol.toUpperCase()} to {coinB.symbol.toUpperCase()}
          </div>

          <div className="ratio-big">
            {(ratio * parseFloat(amount)).toFixed(4)}{" "}
            {coinB.symbol.toUpperCase()}
          </div>

          <div className="ratio-sub">
            1 {coinA.symbol.toUpperCase()} = {ratio.toFixed(6)}{" "}
            {coinB.symbol.toUpperCase()}
          </div>

          <div className="ratio-sub">
            1 {coinB.symbol.toUpperCase()} = {(1 / ratio).toFixed(6)}{" "}
            {coinA.symbol.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
