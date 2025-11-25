"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import axios from "axios";
import { createChart, ColorType } from "lightweight-charts";

interface Item {
	name: string;
	symbol: string;
	image: string;
	type: "crypto" | "fiat";
}

const cryptos: Item[] = [
	{ name: "Bitcoin", symbol: "BTC", image: "https://cryptologos.cc/logos/bitcoin-btc-logo.png", type: "crypto" },
	{ name: "Ethereum", symbol: "ETH", image: "https://cryptologos.cc/logos/ethereum-eth-logo.png", type: "crypto" },
];

const fiats: Item[] = [
	{ name: "US Dollar", symbol: "USD", image: "https://flagcdn.com/us.svg", type: "fiat" },
	{ name: "Euro", symbol: "EUR", image: "https://flagcdn.com/eu.svg", type: "fiat" },
];

export default function Home() {
	const allItems = [...cryptos, ...fiats];

	const [amount, setAmount] = useState<string>("1");
	const [fromItem, setFromItem] = useState<Item>(cryptos[0]);
	const [toItem, setToItem] = useState<Item>(fiats[0]);
	const [result, setResult] = useState<number | null>(null);
	const [rateInfo, setRateInfo] = useState<{ forward: number; reverse: number } | null>(null);

	const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

	const chartContainerRef = useRef<HTMLDivElement | null>(null);
	const chartRef = useRef<any>(null);
	const seriesRef = useRef<any>(null);

	// --------------------- FETCH PRICE -----------------------
	async function fetchConversion() {
		if (!fromItem || !toItem) return;

		// Handle crypto → crypto or crypto → fiat using Coingecko
		if (fromItem.type === "crypto" || toItem.type === "crypto") {
			try {
				const res = await axios.get(
					`https://api.coingecko.com/api/v3/simple/price?ids=${fromItem.name.toLowerCase()}&vs_currencies=${toItem.symbol.toLowerCase()}`
				);

				const price = res.data[fromItem.name.toLowerCase()][toItem.symbol.toLowerCase()];

				setResult(Number(amount) * price);
				setRateInfo({
					forward: price,
					reverse: 1 / price,
				});
			} catch (e) {
				console.error("Crypto conversion error:", e);
			}
		}

		// Handle fiat → fiat using Frankfurter
		if (fromItem.type === "fiat" && toItem.type === "fiat") {
			try {
				const res = await axios.get(
					`https://api.frankfurter.app/latest?from=${fromItem.symbol}&to=${toItem.symbol}`
				);

				const rate = res.data.rates[toItem.symbol];

				setResult(Number(amount) * rate);
				setRateInfo({
					forward: rate,
					reverse: 1 / rate,
				});
			} catch (e) {
				console.error("Fiat conversion failed:", e);
			}
		}
	}

	// --------------------- CHART FETCH -----------------------
	async function loadChart(days: number) {
		if (!chartContainerRef.current || !fromItem || !toItem) return;

		const cryptoId = fromItem.name.toLowerCase();

		// FIAT chart not supported here — only crypto charts
		if (fromItem.type !== "crypto") return;

		const url = `https://api.coingecko.com/api/v3/coins/${cryptoId}/market_chart?vs_currency=${toItem.symbol.toLowerCase()}&days=${days}`;

		try {
			const res = await axios.get(url);
			const prices = res.data.prices.map((p: any) => ({
				time: Math.floor(p[0] / 1000),
				value: p[1],
			}));

			if (!chartRef.current) {
				chartRef.current = createChart(chartContainerRef.current, {
					width: chartContainerRef.current.clientWidth,
					height: 350,
					layout: { background: { type: ColorType.Solid, color: "#ffffff" } },
					grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
				});
				seriesRef.current = chartRef.current.addAreaSeries({
					topColor: "rgba(0, 123, 255, 0.4)",
					bottomColor: "rgba(0, 123, 255, 0.1)",
					lineColor: "#007bff",
					lineWidth: 2,
				});
			}

			seriesRef.current.setData(prices);
			chartRef.current.timeScale().fitContent();
		} catch (e) {
			console.error("Chart error:", e);
		}
	}

	useEffect(() => {
		fetchConversion();
	}, [fromItem, toItem, amount]);

	// --------------------- UI -----------------------
	function Dropdown({ label, selected, onSelect, id }: any) {
		return (
			<div className="relative w-full">
				<div
					className="flex items-center gap-3 p-3 border rounded cursor-pointer bg-white"
					onClick={() => setOpenDropdown(openDropdown === id ? null : id)}
				>
					<Image src={selected.image} alt="" width={32} height={32} />
					<span className="font-semibold">{selected.symbol}</span>
				</div>

				{openDropdown === id && (
					<div className="dropdown-panel">
						{allItems.map((item) => (
							<div
								key={item.symbol}
								className="flex items-center gap-3 p-2 hover:bg-gray-100 cursor-pointer"
								onClick={() => {
									onSelect(item);
									setOpenDropdown(null);
								}}
							>
								<Image src={item.image} alt="" width={28} height={28} />
								<div>
									<div className="font-semibold">{item.symbol}</div>
									<div className="text-xs text-gray-500">{item.name}</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="max-w-4xl mx-auto p-6">
			<h2 className="text-xl font-bold mb-2">AMOUNT</h2>
			<input
				type="number"
				value={amount}
				min="0"
				onChange={(e) => setAmount(e.target.value)}
				className="border p-2 w-full rounded"
			/>

			<div className="mt-6">
				<h2 className="text-xl font-bold mb-2">FROM</h2>
				<Dropdown id="from" selected={fromItem} onSelect={setFromItem} />
			</div>

			<div className="mt-4 rotate-90 w-fit mx-auto">⇅</div>

			<div className="mt-6">
				<h2 className="text-xl font-bold mb-2">TO</h2>
				<Dropdown id="to" selected={toItem} onSelect={setToItem} />
			</div>

			{rateInfo && (
				<div className="mt-4 text-lg">
					<div>1 {fromItem.symbol} → {rateInfo.forward.toFixed(6)} {toItem.symbol}</div>
					<div>1 {toItem.symbol} = {rateInfo.reverse.toFixed(6)} {fromItem.symbol}</div>
				</div>
			)}

			{/* ---------------- CHART ---------------- */}
			<div className="mt-10">
				<h2 className="text-xl font-bold">BTC to ETH Price Chart</h2>
				<p className="text-gray-500 mb-4">Historical price of Bitcoin expressed in {toItem.symbol}</p>

				<div className="flex gap-2 mb-4">
					{[1, 7, 30, 90, 180, 365].map((d) => (
						<button
							key={d}
							className="px-3 py-1 border rounded"
							onClick={() => loadChart(d)}
						>
							{d === 1 ? "24H" : d === 7 ? "7D" : d === 30 ? "1M" : d === 90 ? "3M" : d === 180 ? "6M" : "1Y"}
						</button>
					))}
				</div>

				<div ref={chartContainerRef} className="w-full h-[350px] border rounded bg-white"></div>
			</div>
		</div>
	);
}
