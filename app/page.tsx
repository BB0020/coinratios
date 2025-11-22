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

  // Load top 250 coins with logos
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
      )
      .then((res) => setCoins(res.data))
      .catch(console.error);
  }, []);

  // Load live price ratio
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

  // Load historical chart
  const loadChart = async () => {
    if (!coinA || !coinB) return;

    const rangeA = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinA.id}/market_chart?vs_currency=usd&days=365`
    );

    const rangeB = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinB.id}/market_chart?vs_currency=usd&days=365`
    );

    const pricesA = rangeA.data.prices;
    const pricesB = rangeB.data.prices;

    const merged = pricesA.map((pA: any, i: number) => ({
      time: pA[0],
      ratio: pA[1] / pricesB[i][1],
    }));

    setChartData({
      labels: merged.map((m: any) =>
        new Date(m.time).toLocaleDateString()
      ),
      datasets: [
        {
          label: `${coinA.symbol.toUpperCase()}/${coinB.symbol.toUpperCase()}`,
          data: merged.map((m: any) => m.ratio),
          borderWidth: 2,
        },
      ],
    });
  };

  const filteredA = coins.filter((c) =>
    `${c.name} ${c.symbol}`.toLowerCase().includes(searchA.toLowerCase())
  );
  const filteredB = coins.filter((c) =>
    `${c.name} ${c.symbol}`.toLowerCase().includes(searchB.toLowerCase())
  );

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: "bold", marginBottom: 30 }}>
        CoinRatios — Compare Any 2 Cryptos
      </h1>

      {/* Searchable dropdowns */}
      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <input
            placeholder="Search Coin A..."
            value={searchA}
            onChange={(e) => setSearchA(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <div
            style={{
              maxHeight: 150,
              overflowY: "auto",
              border: "1px solid #ddd",
              borderRadius: 4,
            }}
          >
            {filteredA.map((coin) => (
              <div
                key={coin.id}
                onClick={() => setCoinA(coin)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 10px",
                  cursor: "pointer",
                  background:
                    coinA?.id === coin.id ? "#f0f4ff" : "white",
                }}
              >
                <img
                  src={coin.image}
                  width={20}
                  height={20}
                  style={{ marginRight: 8 }}
                />
                {coin.name} ({coin.symbol.toUpperCase()})
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <input
            placeholder="Search Coin B..."
            value={searchB}
            onChange={(e) => setSearchB(e.target.value)}
            style={{ width: "100%", padding: 10, marginBottom: 8 }}
          />
          <div
            style={{
              maxHeight: 150,
              overflowY: "auto",
              border: "1px solid #ddd",
              borderRadius: 4,
            }}
          >
            {filteredB.map((coin) => (
              <div
                key={coin.id}
                onClick={() => setCoinB(coin)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "8px 10px",
                  cursor: "pointer",
                  background:
                    coinB?.id === coin.id ? "#f0f4ff" : "white",
                }}
              >
                <img
                  src={coin.image}
                  width={20}
                  height={20}
                  style={{ marginRight: 8 }}
                />
                {coin.name} ({coin.symbol.toUpperCase()})
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Show ratio */}
      {ratio && (
        <div style={{ fontSize: 24, marginTop: 20 }}>
          <b>Ratio:</b> {ratio.toFixed(6)}
        </div>
      )}

      {/* Button */}
      <button
        onClick={loadChart}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          background: "#2f73ff",
          color: "white",
          borderRadius: 6,
          border: "none",
          cursor: "pointer",
        }}
      >
        Load 1-Year Ratio Chart
      </button>

      {/* Chart */}
      {chartData && (
        <div style={{ marginTop: 30 }}>
          <Line data={chartData} />
        </div>
      )}
    </div>
  );
}
