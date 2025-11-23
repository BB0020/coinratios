"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { createChart } from "lightweight-charts";

interface Asset {
    id: string;
    symbol: string;
    name: string;
    image?: string;
    type: "crypto" | "fiat";
}

// ------------------------------
// ASSET LIST (CRYPTO + FIAT)
// ------------------------------
const cryptoList: Asset[] = [
    {
        id: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        image: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
        type: "crypto"
    },
    {
        id: "ethereum",
        symbol: "ETH",
        name: "Ethereum",
        image: "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
        type: "crypto"
    },
];

const fiatList: Asset[] = [
    {
        id: "USD",
        symbol: "USD",
        name: "US Dollar",
        image: "https://flagcdn.com/us.svg",
        type: "fiat"
    },
    {
        id: "EUR",
        symbol: "EUR",
        name: "Euro",
        image: "https://flagcdn.com/eu.svg",
        type: "fiat"
    },
];

const allAssets: Asset[] = [...cryptoList, ...fiatList];

// ====================================
//            MAIN COMPONENT
// ====================================
export default function Page() {
    const [amount, setAmount] = useState<string>("1");
    const [from, setFrom] = useState<Asset>(allAssets[0]);
    const [to, setTo] = useState<Asset>(allAssets[1]);
    const [result, setResult] = useState<number | null>(null);

    const [historyData, setHistoryData] = useState<any[]>([]);
    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<any>(null);
    const areaRef = useRef<any>(null);

    // --------------------------------------
    // Fetch conversion rate
    // --------------------------------------
    async function fetchRate() {
        try {
            if (!from || !to) return;

            // Fiat ↔ Fiat or Crypto ↔ Fiat or Crypto ↔ Crypto
            let rate = 0;

            if (from.type === "fiat" && to.type === "fiat") {
                // ★ Frankfurter API
                const res = await fetch(`https://api.frankfurter.app/latest?from=${from.id}&to=${to.id}`);
                const data = await res.json();
                rate = data.rates?.[to.id] || 0;
            } 
            else {
                // ★ CoinGecko
                const res = await fetch(
                    `https://api.coingecko.com/api/v3/simple/price?ids=${from.id}&vs_currencies=${to.symbol.toLowerCase()}`
                );
                const data = await res.json();
                rate = data?.[from.id]?.[to.symbol.toLowerCase()] || 0;
            }

            setResult(Number(rate) * Number(amount || 0));
        } catch (err) {
            console.error("Rate fetch error:", err);
        }
    }

    // AUTO REFRESH RATE (Every 10 seconds)
    useEffect(() => {
        fetchRate();
        const interval = setInterval(fetchRate, 10000);
        return () => clearInterval(interval);
    }, [from, to, amount]);

    // --------------------------------------
    // Fetch Historical Price (CoinGecko only)
    // --------------------------------------
    async function fetchHistory() {
        try {
            if (from.type === "fiat" || to.type === "fiat") {
                setHistoryData([]);
                return;
            }

            const res = await fetch(
                `https://api.coingecko.com/api/v3/coins/${from.id}/market_chart?vs_currency=${to.symbol.toLowerCase()}&days=30`
            );

            const data = await res.json();

            const mapped = data.prices
                .map((p: any) => {
                    if (!p || !p[0] || !p[1]) return null;
                    return {
                        time: Math.floor(p[0] / 1000),
                        value: Number(p[1]),
                    };
                })
                .filter((d: any): d is { time: number; value: number } => d !== null);

            setHistoryData(mapped);
        } catch (err) {
            console.error("History fetch error:", err);
        }
    }

    useEffect(() => {
        fetchHistory();
    }, [from, to]);

    // --------------------------------------
    // RENDER CHART
    // --------------------------------------
    useEffect(() => {
        if (!chartContainerRef.current) return;

        chartContainerRef.current.innerHTML = "";
        const chart = createChart(chartContainerRef.current, {
            height: 350,
            layout: {
                textColor: "#000",
                background: { color: "#f8f9fa" },
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { visible: false },
            },
            crosshair: { mode: 1 },
        });

        chartRef.current = chart;

        const area = chart.addSeries({
            type: "Area" as any,
        } as any);

        areaRef.current = area;

        if (historyData.length > 0) {
            area.setData(historyData);
        }

        return () => chart.remove();
    }, [historyData]);

    // --------------------------------------
    // Swap From/To
    // --------------------------------------
    function swap() {
        const prev = from;
        setFrom(to);
        setTo(prev);
    }

    // --------------------------------------
    // Render Asset Dropdown
    // --------------------------------------
    function AssetSelect({
        label,
        value,
        onChange,
        disableSymbol,
    }: {
        label: string;
        value: Asset;
        onChange: (a: Asset) => void;
        disableSymbol: string;
    }) {
        return (
            <div>
                <label className="font-bold">{label}</label>

                <select
                    value={value.id}
                    onChange={(e) => {
                        const found = allAssets.find((a) => a.id === e.target.value);
                        if (found) onChange(found);
                    }}
                    className="w-full border p-3 rounded-lg bg-white"
                >
                    {allAssets.map((a) => (
                        <option key={a.id} value={a.id} disabled={a.symbol === disableSymbol}>
                            {a.symbol} — {a.name}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">CoinRatios Converter</h1>

            {/* AMOUNT */}
            <div className="mb-6">
                <label className="font-bold">AMOUNT</label>
                <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="1"
                    className="w-full border p-3 rounded-lg"
                />
            </div>

            {/* FROM / TO */}
            <div className="grid grid-cols-3 gap-4 items-center">
                <AssetSelect label="FROM" value={from} onChange={setFrom} disableSymbol={to.symbol} />

                {/* Swap Button */}
                <button
                    onClick={swap}
                    className="mx-auto bg-white border rounded-full p-4 hover:rotate-180 transition"
                >
                    ↔
                </button>

                <AssetSelect label="TO" value={to} onChange={setTo} disableSymbol={from.symbol} />
            </div>

            {/* RESULT */}
            <div className="text-center mt-10">
                <h2 className="text-4xl font-extrabold">
                    {result !== null ? result.toFixed(6) : "--"} {to.symbol}
                </h2>
            </div>

            {/* CHART */}
            <div className="mt-10">
                <h3 className="font-bold mb-3">
                    {from.symbol} → {to.symbol} (30 Day History)
                </h3>

                <div ref={chartContainerRef} style={{ width: "100%", height: 350 }}></div>
            </div>
        </div>
    );
}
