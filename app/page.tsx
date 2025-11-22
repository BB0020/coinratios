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

export default function Home() {
  const [coins, setCoins] = useState([]);
  const [coinA, setCoinA] = useState("");
  const [coinB, setCoinB] = useState("");
  const [ratio, setRatio] = useState<number | null>(null);
  const [chartData, setChartData] = useState<any>(null);

  // Load all coins once
  useEffect(() => {
    axios
      .get("https://api.coingecko.com/api/v3/coins/list")
      .then((res) => setCoins(res.data))
      .catch((err) => console.error("Coin list error:", err));
  }, []);

  // Load live ratio
  useEffect(() => {
    if (!coinA || !coinB) return;

    axios
      .get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinA},${coinB}&vs_currencies=usd`
      )
      .then((res) => {
        const a = res.data[coinA]?.usd;
        const b = res.data[coinB]?.usd;
        if (a && b) setRatio(a / b);
      })
      .catch((err) => console.error("Ratio error:", err));
  }, [coinA, coinB]);

  // Load historical ratio chart
  const loadChart = async () => {
    if (!coinA || !coinB) return;

    try {
      const rangeA = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinA}/market_chart?vs_currency=usd&days=365`
      );
      const rangeB = await axios.get(
        `https://api.coingecko.com/api/v3/coins/${coinB}/market_chart?vs_currency=usd&days=365`
      );

      const pricesA = rangeA.data.prices; // [timestamp, price]
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
            label: `${coinA.toUpperCase()}/${coinB.toUpperCase()} Ratio`,
            data: merged.map((m: any) => m.ratio),
            borderWidth: 2,
          },
        ],
      });
    } catch (err) {
      console.error("Chart load error:", err);
    }
  };

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: "bold", marginBottom: 20 }}>
        CoinRatios — Compare Any 2 Cryptos
      </h1>

      {/* Dropdown selectors */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <select
          value={coinA}
          onChange={(e) => setCoinA(e.target.value)}
          style={{ flex: 1, padding: 10 }}
        >
          <option value="">Select Coin A</option>
          {coins.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={coinB}
          onChange={(e) => setCoinB(e.target.value)}
          style={{ flex: 1, padding: 10 }}
        >
          <option value="">Select Coin B</option>
          {coins.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Show live ratio */}
      {ratio && (
        <div style={{ fontSize: 24, marginBottom: 20 }}>
          <b>Current Ratio:</b> {ratio.toFixed(6)}
        </div>
      )}

      {/* Load Chart */}
      <button
        onClick={loadChart}
        style={{
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

      {/* Chart Output */}
      {chartData && (
        <div style={{ marginTop: 30 }}>
          <Line data={chartData} />
        </div>
      )}
    </div>
  );
}
