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
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [coinA, setCoinA] = useState<Coin | null>(null);
  const [coinB, setCoinB] = useState<Coin | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [chartData, setChartData] = useState<any>(null);

  // Load top 250 coins
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      )
      .then((res) => setCoins(res.data))
      .catch(console.error);
  }, []);

  // Auto-load ratio when both selected
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
      })
      .catch(console.error);
  }, [coinA, coinB]);

  // Auto-load chart when both selected
  useEffect(() => {
    if (!coinA || !coinB) return;

    const load = async () => {
      const rangeA = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinA.id}/market_chart?vs_currency=usd&days=365`
      );
      const rangeB = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinB.id}/market_chart?vs_currency=usd&days=365`
      );

      const merged = rangeA.data.prices.map((pA: any, i: number) => ({
        time: pA[0],
        ratio: pA[1] / rangeB.data.prices[i][1],
      }));

      setChartData({
        labels: merged.map((m: any) =>
          new Date(m.time).toLocaleDateString()
        ),
        datasets: [
          {
            label: `${coinA.symbol.toUpperCase()}/${coinB.symbol.toUpperCase()}`,
            data: merged.map((m: any) => m.ratio),
            borderWidth: 3,
            pointRadius: 0,
          },
        ],
      });
    };

    load();
  }, [coinA, coinB]);

  const filteredA = coins.filter((c) =>
    `${c.name} ${c.symbol}`.toLowerCase().includes(searchA.toLowerCase())
  );
  const filteredB = coins.filter((c) =>
    `${c.name} ${c.symbol}`.toLowerCase().includes(searchB.toLowerCase())
  );

  return (
    <div style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 34, marginBottom: 25 }}>
        CoinRatios — Compare Any 2 Cryptos
      </h1>

      {/* 2-COLUMN SELECTOR CARDS */}
      <div style={{ display: "flex", gap: 20 }}>
        {/* LEFT CARD */}
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold", marginBottom: 10 }}>
            Select Coin A
          </div>
          <input
            className="search-input"
            placeholder="Search..."
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
                onClick={() => setCoinA(coin)}
              >
                <img
                  src={coin.image}
                  width={24}
                  height={24}
                  style={{ marginRight: 10 }}
                />
                {coin.name} ({coin.symbol.toUpperCase()})
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT CARD */}
        <div className="card" style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold", marginBottom: 10 }}>
            Select Coin B
          </div>
          <input
            className="search-input"
            placeholder="Search..."
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
                onClick={() => setCoinB(coin)}
              >
                <img
                  src={coin.image}
                  width={24}
                  height={24}
                  style={{ marginRight: 10 }}
                />
                {coin.name} ({coin.symbol.toUpperCase()})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RATIO HEADER */}
      {ratio && (
        <h2 style={{ marginTop: 30 }}>
          <b>Ratio:</b> {ratio.toFixed(6)}
        </h2>
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
