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

// Fiat preset list
const fiats = [
  {
    id: "usd",
    symbol: "usd",
    name: "US Dollar",
    image: "https://flagcdn.com/us.svg",
  },
  {
    id: "eur",
    symbol: "eur",
    name: "Euro",
    image: "https://flagcdn.com/eu.svg",
  },
  {
    id: "gbp",
    symbol: "gbp",
    name: "British Pound",
    image: "https://flagcdn.com/gb.svg",
  },
  {
    id: "cad",
    symbol: "cad",
    name: "Canadian Dollar",
    image: "https://flagcdn.com/ca.svg",
  },
  {
    id: "aud",
    symbol: "aud",
    name: "Australian Dollar",
    image: "https://flagcdn.com/au.svg",
  },
];

export default function Home() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");

  const [amount, setAmount] = useState<number>(1);

  const [coinA, setCoinA] = useState<Coin | null>({
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
  });

  const [coinB, setCoinB] = useState<Coin | null>({
    id: "usd",
    symbol: "usd",
    name: "US Dollar",
    image: "https://flagcdn.com/us.svg",
  });

  const [ratio, setRatio] = useState<number | null>(null);
  const [chartData, setChartData] = useState<any>(null);

  // Load top 250 crypto coins on mount
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      )
      .then((res) => setCoins([...fiats, ...res.data]))
      .catch(console.error);
  }, []);

  // CALCULATE RATIO — also updates whenever amount changes
  useEffect(() => {
    if (!coinA || !coinB) return;

    axios
      .get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinA.id}&vs_currencies=${coinB.id}`
      )
      .then((res) => {
        const value = res.data?.[coinA.id]?.[coinB.id];

        if (value !== undefined && value !== null) {
          setRatio(value);
        }
      });
  }, [coinA, coinB, amount]); // ← FIXED

  // Load 1-year price ratio chart
  useEffect(() => {
    if (!coinA || !coinB) return;

    const load = async () => {
      try {
        const a = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${coinA.id}/market_chart?vs_currency=usd&days=365`
        );
        const b = await axios.get(
          `https://api.coingecko.com/api/v3/coins/${coinB.id}/market_chart?vs_currency=usd&days=365`
        );

        const merged = a.data.prices.map((pA: any, i: number) => ({
          time: pA[0],
          ratio: pA[1] / b.data.prices[i][1],
        }));

        setChartData({
          labels: merged.map((m: any) =>
            new Date(m.time).toLocaleDateString()
          ),
          datasets: [
            {
              label: `${coinA.symbol.toUpperCase()} / ${coinB.symbol.toUpperCase()}`,
              data: merged.map((m: any) => m.ratio),
              borderColor: "#3b82f6",
              backgroundColor: "rgba(59,130,246,0.1)",
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.25,
            },
          ],
        });
      } catch (err) {
        console.error(err);
      }
    };

    load();
  }, [coinA, coinB]);

  const filteredA = coins.filter((c) =>
    `${c.name} ${c.symbol}`
      .toLowerCase()
      .includes(searchA.toLowerCase())
  );

  const filteredB = coins.filter((c) =>
    `${c.name} ${c.symbol}`
      .toLowerCase()
      .includes(searchB.toLowerCase())
  );

  const swapCoins = () => {
    const temp = coinA;
    setCoinA(coinB);
    setCoinB(temp);
  };

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      {/* AMOUNT */}
      <div className="card" style={{ marginBottom: 30 }}>
        <div className="label">Amount</div>
        <input
          className="amount-input"
          type="number"
          value={amount}
          min="0"
          onChange={(e) => setAmount(Number(e.target.value))}
          placeholder="Enter amount..."
        />
        {(!amount || amount <= 0) && (
          <div className="amount-error">
            Amount needs to be a number and greater than 0.
          </div>
        )}
      </div>

      {/* COIN SELECTORS */}
      <div style={{ display: "flex", gap: 20 }}>
        {/* FROM */}
        <div className="select-card">
          <div className="label">FROM</div>

          <div className="selected-coin">
            <img src={coinA?.image} width={36} height={36} />
            <div>
              <div className="coin-symbol">{coinA?.symbol.toUpperCase()}</div>
              <div className="coin-name">{coinA?.name}</div>
            </div>
          </div>

          <input
            className="search-input"
            placeholder="Search all..."
            value={searchA}
            onChange={(e) => setSearchA(e.target.value)}
          />

          <div className="coin-list">
            {filteredA.map((coin) => (
              <div
                key={coin.id}
                className={`coin-item ${
                  coinA?.id === coin.id ? "selected" : ""
                }`}
                onClick={() => {
                  setCoinA(coin);
                  setSearchA("");
                }}
              >
                <img src={coin.image} width={32} height={32} />
                <div style={{ marginLeft: 10 }}>
                  <div className="coin-symbol">{coin.symbol.toUpperCase()}</div>
                  <div className="coin-name">{coin.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SWAP BUTTON */}
        <div className="swap-container">
          <button className="swap-button" onClick={swapCoins}>
            ⇆
          </button>
        </div>

        {/* TO */}
        <div className="select-card">
          <div className="label">TO</div>

          <div className="selected-coin">
            <img src={coinB?.image} width={36} height={36} />
            <div>
              <div className="coin-symbol">{coinB?.symbol.toUpperCase()}</div>
              <div className="coin-name">{coinB?.name}</div>
            </div>
          </div>

          <input
            className="search-input"
            placeholder="Search all..."
            value={searchB}
            onChange={(e) => setSearchB(e.target.value)}
          />

          <div className="coin-list">
            {filteredB.map((coin) => (
              <div
                key={coin.id}
                className={`coin-item ${
                  coinB?.id === coin.id ? "selected" : ""
                }`}
                onClick={() => {
                  setCoinB(coin);
                  setSearchB("");
                }}
              >
                <img src={coin.image} width={32} height={32} />
                <div style={{ marginLeft: 10 }}>
                  <div className="coin-symbol">{coin.symbol.toUpperCase()}</div>
                  <div className="coin-name">{coin.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RESULT DISPLAY */}
      {ratio !== null && amount > 0 && (
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <div className="ratio-label">
            1 {coinA?.symbol.toUpperCase()} → {coinB?.symbol.toUpperCase()}
          </div>

          <div className="ratio-value">
            {(ratio * amount).toFixed(6)} {coinB?.symbol.toUpperCase()}
          </div>

          <div className="sub-info">
            1 {coinA?.symbol.toUpperCase()} = {ratio.toFixed(6)}{" "}
            {coinB?.symbol.toUpperCase()}
            <br />
            1 {coinB?.symbol.toUpperCase()} = {(1 / ratio).toFixed(6)}{" "}
            {coinA?.symbol.toUpperCase()}
          </div>
        </div>
      )}

      {/* CHART */}
      {chartData && (
        <div className="chart-container">
          <Line data={chartData} />
        </div>
      )}
    </div>
  );
}
