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
  const [search, setSearch] = useState("");
  const [coinA, setCoinA] = useState<Coin | null>(null);
  const [coinB, setCoinB] = useState<Coin | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [chartData, setChartData] = useState<any>(null);

  // Load coin list
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      )
      .then((res) => setCoins(res.data))
      .catch(console.error);
  }, []);

  // Load ratio
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

  // Load chart
  useEffect(() => {
    if (!coinA || !coinB) return;

    const load = async () => {
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
            backgroundColor: "rgba(59,130,246,0.2)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
          },
        ],
      });
    };

    load();
  }, [coinA, coinB]);

  const filtered = coins.filter((c) =>
    `${c.name} ${c.symbol}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 24 }}>CoinRatios</h1>

      <input
        className="search-input"
        placeholder="Search coins..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="coin-list">
        {filtered.map((coin) => {
          const selected =
            coinA?.id === coin.id || coinB?.id === coin.id;

          return (
            <div
              key={coin.id}
              className={`coin-item ${selected ? "selected" : ""}`}
              onClick={() => {
                if (!coinA) setCoinA(coin);
                else if (!coinB) setCoinB(coin);
                else {
                  setCoinA(coin);
                  setCoinB(null);
                }
              }}
            >
              <img
                src={coin.image}
                width={22}
                height={22}
                style={{ marginRight: 8 }}
              />
              {coin.name} ({coin.symbol.toUpperCase()})
            </div>
          );
        })}
      </div>

      {coinA && coinB && ratio && (
        <h2 style={{ marginTop: 20 }}>
          <b>{coinA.symbol.toUpperCase()}</b> /
          <b> {coinB.symbol.toUpperCase()}</b>: {ratio.toFixed(6)}
        </h2>
      )}

      {chartData && (
        <div className="chart-container">
          <Line data={chartData} />
        </div>
      )}
    </div>
  );
}
