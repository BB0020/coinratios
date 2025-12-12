"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
    createChart,
    ColorType,
    LineStyle,
    type UTCTimestamp,
} from "lightweight-charts";
import ThemeToggle from "./ThemeToggle";

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------
interface Coin {
    id: string;
    symbol: string;
    name: string;
    image: string;
    type: "crypto" | "fiat";
}

interface HistoryPoint {
    time: number;
    value: number;
}

// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------
const USD: Coin = {
    id: "usd",
    symbol: "USD",
    name: "US Dollar",
    image: "https://flagcdn.com/us.svg",
    type: "fiat",
};

const FIAT_LIST: Coin[] = [
    { id: "AUD", symbol: "AUD", name: "Australian Dollar", image: "https://flagcdn.com/au.svg", type: "fiat" },
    { id: "BRL", symbol: "BRL", name: "Brazilian Real", image: "https://flagcdn.com/br.svg", type: "fiat" },
    { id: "CAD", symbol: "CAD", name: "Canadian Dollar", image: "https://flagcdn.com/ca.svg", type: "fiat" },
    { id: "CHF", symbol: "CHF", name: "Swiss Franc", image: "https://flagcdn.com/ch.svg", type: "fiat" },
    { id: "CNY", symbol: "CNY", name: "Chinese Yuan", image: "https://flagcdn.com/cn.svg", type: "fiat" },
    { id: "DKK", symbol: "DKK", name: "Danish Krone", image: "https://flagcdn.com/dk.svg", type: "fiat" },
    { id: "EUR", symbol: "EUR", name: "Euro", image: "https://flagcdn.com/eu.svg", type: "fiat" },
    { id: "GBP", symbol: "GBP", name: "British Pound", image: "https://flagcdn.com/gb.svg", type: "fiat" },
    { id: "HKD", symbol: "HKD", name: "Hong Kong Dollar", image: "https://flagcdn.com/hk.svg", type: "fiat" },
    { id: "INR", symbol: "INR", name: "Indian Rupee", image: "https://flagcdn.com/in.svg", type: "fiat" },
    { id: "JPY", symbol: "JPY", name: "Japanese Yen", image: "https://flagcdn.com/jp.svg", type: "fiat" },
    { id: "KRW", symbol: "KRW", name: "South Korean Won", image: "https://flagcdn.com/kr.svg", type: "fiat" },
    { id: "MXN", symbol: "MXN", name: "Mexican Peso", image: "https://flagcdn.com/mx.svg", type: "fiat" },
    { id: "NOK", symbol: "NOK", name: "Norwegian Krone", image: "https://flagcdn.com/no.svg", type: "fiat" },
    { id: "NZD", symbol: "NZD", name: "New Zealand Dollar", image: "https://flagcdn.com/nz.svg", type: "fiat" },
    { id: "SEK", symbol: "SEK", name: "Swedish Krona", image: "https://flagcdn.com/se.svg", type: "fiat" },
    { id: "SGD", symbol: "SGD", name: "Singapore Dollar", image: "https://flagcdn.com/sg.svg", type: "fiat" },
    { id: "TRY", symbol: "TRY", name: "Turkish Lira", image: "https://flagcdn.com/tr.svg", type: "fiat" },
    { id: "ZAR", symbol: "ZAR", name: "South African Rand", image: "https://flagcdn.com/za.svg", type: "fiat" },
];

// ------------------------------------------------------------
// PAGE
// ------------------------------------------------------------
export default function Page() {
    // STATE
    const [allCoins, setAllCoins] = useState<Coin[]>([]);
    const [fromCoin, setFromCoin] = useState<Coin | null>(null);
    const [toCoin, setToCoin] = useState<Coin | null>(null);
    const [amount, setAmount] = useState("1");
    const [range, setRange] = useState("24H");
    const [result, setResult] = useState<number | null>(null);

    const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);
    const [fromSearch, setFromSearch] = useState("");
    const [toSearch, setToSearch] = useState("");

    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<any>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    const historyCache = useRef<Record<string, HistoryPoint[]>>({});
    const realtimeCache = useRef<Record<string, number>>({});

    // ------------------------------------------------------------
    // LOAD COINS
    // ------------------------------------------------------------
    useEffect(() => {
        async function loadCoins() {
            const r = await fetch("/api/coins");
            const d = await r.json();
            const cryptoList = d.coins ?? [];
            const final = [USD, ...cryptoList, ...FIAT_LIST];
            setAllCoins(final);

            const btc = final.find((c) => c.id === "bitcoin");
            setFromCoin(btc || final[1]);
            setToCoin(USD);
        }
        loadCoins();
    }, []);

    // ------------------------------------------------------------
    // FILTER
    // ------------------------------------------------------------
    const filteredCoins = useCallback(
        (q: string) => {
            const s = q.toLowerCase();
            return allCoins.filter(
                (c) =>
                    c.symbol.toLowerCase().includes(s) ||
                    c.name.toLowerCase().includes(s)
            );
        },
        [allCoins]
    );

    // ------------------------------------------------------------
    // REALTIME
    // ------------------------------------------------------------
    const getRealtime = useCallback(async (coin: Coin) => {
        const key = coin.id;
        if (realtimeCache.current[key]) return realtimeCache.current[key];
        const r = await fetch(`/api/price?base=${coin.id}&quote=usd`);
        const j = await r.json();
        const price = typeof j.price === "number" ? j.price : 0;
        realtimeCache.current[key] = price;
        return price;
    }, []);

    // ------------------------------------------------------------
    // COMPUTE RESULT
    // ------------------------------------------------------------
    useEffect(() => {
        async function compute() {
            if (!fromCoin || !toCoin) return;
            const amt = Number(amount);
            if (amt <= 0) return setResult(null);
            const [a, b] = await Promise.all([
                getRealtime(fromCoin),
                getRealtime(toCoin),
            ]);
            setResult((a / b) * amt);
        }
        const t = setTimeout(compute, 120);
        return () => clearTimeout(t);
    }, [amount, fromCoin, toCoin, getRealtime]);

    // ------------------------------------------------------------
    // RANGE → DAYS
    // ------------------------------------------------------------
    const rangeToDays = (r: string) =>
        r === "24H"
            ? 1
            : r === "7D"
            ? 7
            : r === "1M"
            ? 30
            : r === "3M"
            ? 90
            : r === "6M"
            ? 180
            : 365;

    // ------------------------------------------------------------
    // HISTORY (CACHED)
    // ------------------------------------------------------------
    const getHistory = useCallback(async (base: Coin, quote: Coin, days: number) => {
        const key = `${base.id}-${quote.id}-${days}`;
        if (historyCache.current[key]) return historyCache.current[key];

        const r = await fetch(
            `/api/history?base=${base.id}&quote=${quote.id}&days=${days}`
        );
        const j = await r.json();

        const cleaned = (j.history ?? [])
            .filter((p: any) => Number.isFinite(p.value))
            .sort((a: any, b: any) => a.time - b.time);

        historyCache.current[key] = cleaned;
        return cleaned;
    }, []);

    // ------------------------------------------------------------
    // NORMALIZED
    // ------------------------------------------------------------
    const getNormalizedHistory = useCallback(
        async (base: Coin, quote: Coin, days: number) => {
            let forwardBase = base;
            let forwardQuote = quote;
            let invert = false;

            if (base.type === "fiat") {
                forwardBase = quote;
                forwardQuote = base;
                invert = true;
            }

            const hist = await getHistory(forwardBase, forwardQuote, days);
            if (!invert) return hist;

            return hist.map((p: HistoryPoint) => ({
                time: p.time,
                value: p.value ? 1 / p.value : 0,
            }));
        },
        [getHistory]
    );

    // ------------------------------------------------------------
    // PRICE FORMATTER (CMC Style)
    // ------------------------------------------------------------
    const fmt = (v: number) => {
        if (v >= 1000) return v.toFixed(2);
        if (v >= 1) return v.toFixed(4);
        if (v >= 0.01) return v.toFixed(6);
        return v.toFixed(8);
    };

    // ------------------------------------------------------------
    // SEGMENTATION ENGINE
    // ------------------------------------------------------------
    function buildSegments(hist: HistoryPoint[], open: number) {
        const segs: {
            rising: boolean;
            points: HistoryPoint[];
        }[] = [];

        let current = {
            rising: hist[0].value >= open,
            points: [hist[0]],
        };

        for (let i = 1; i < hist.length; i++) {
            const prev = hist[i - 1];
            const curr = hist[i];
            const wasUp = prev.value >= open;
            const isUp = curr.value >= open;

            if (wasUp !== isUp) {
                // CROSSOVER POINT
                const t0 = prev.time;
                const t1 = curr.time;
                const v0 = prev.value;
                const v1 = curr.value;
                const ratio = (open - v0) / (v1 - v0);
                const crossTime = t0 + (t1 - t0) * ratio;

                const cp: HistoryPoint = {
                    time: crossTime,
                    value: open,
                };

                current.points.push(cp);
                segs.push(current);

                current = {
                    rising: isUp,
                    points: [cp, curr],
                };
            } else {
                current.points.push(curr);
            }
        }

        segs.push(current);
        return segs;
    }

    // ------------------------------------------------------------
    // CREATE TOOLTIP ELEMENT
    // ------------------------------------------------------------
    function createTooltipElement(): HTMLDivElement {
        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.zIndex = "9999";
        el.style.pointerEvents = "none";
        el.style.padding = "10px 14px";
        el.style.borderRadius = "8px";
        el.style.background = "rgba(255,255,255,0.98)";
        el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
        el.style.fontSize = "13px";
        el.style.fontWeight = "500";
        el.style.color = "#111";
        el.style.visibility = "hidden";
        return el;
    }

    // ------------------------------------------------------------
    // BUILD CHART
    // ------------------------------------------------------------
    const build = useCallback(async () => {
    if (!fromCoin || !toCoin) return;

    const container = chartContainerRef.current;
    if (!container) return;

    const hist = await getNormalizedHistory(
        fromCoin,
        toCoin,
        rangeToDays(range)
    );
    if (!hist.length) return;

    // Destroy existing chart
    if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
    }

    // Create chart
    const chart = createChart(container, {
        width: container.clientWidth,
        height: 400,
        layout: {
            background: { color: "transparent" },
            textColor: "#555",
        },
        grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
        },
        timeScale: {
            borderVisible: false,
            timeVisible: true,
            tickMarkFormatter: (t: UTCTimestamp) => {
                const d = new Date(t * 1000);
                if (range === "24H") {
                    return d.toLocaleTimeString(undefined, {
                        hour: "numeric",
                        hour12: true,
                    });
                }
                return d.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                });
            },
        },
        rightPriceScale: {
            borderVisible: false,
        },
        crosshair: {
            mode: 1,
            vertLine: {
                width: 1,
                style: LineStyle.Solid,
                color: "rgba(0,0,0,0.25)",
            },
            horzLine: { visible: false },
        },
    });

    chartRef.current = chart;

    // ------------------------------------------------------------
    // OPEN PRICE
    // ------------------------------------------------------------
    const open =
        hist.length >= 3
            ? (hist[0].value + hist[1].value + hist[2].value) / 3
            : hist[0].value;

    const segs = buildSegments(hist, open);

    // Invisible main line to power tooltip value lookup
    const mainSeries = chart.addLineSeries({
        lineWidth: 1,
        color: "transparent",
    });

    mainSeries.setData(
        hist.map((p: HistoryPoint) => ({
            time: p.time as UTCTimestamp,
            value: p.value,
        }))
    );

    // Horizontal Open Line
    const openLine = chart.addLineSeries({
        lineWidth: 1,
        color: "rgba(150,150,150,0.40)",
        lineStyle: LineStyle.Dotted,
    });

    openLine.setData(
        hist.map((p: HistoryPoint) => ({
            time: p.time as UTCTimestamp,
            value: open,
        }))
    );

    // ------------------------------------------------------------
    // CURRENT PRICE MARKER
    // ------------------------------------------------------------
    const last = hist[hist.length - 1];
    const risingNow = last.value >= open;

    const markerColor = risingNow ? "#16c784" : "#ea3943";

    const lastSeries = chart.addLineSeries({
        lineWidth: 1,
        color: "transparent",
    });

    lastSeries.setData([
        {
            time: last.time as UTCTimestamp,
            value: last.value,
        },
    ]);

    lastSeries.setMarkers([
        {
            time: last.time as UTCTimestamp,
            position: "aboveBar",
            color: markerColor,
            shape: "circle",
            size: 6,
        },
    ]);

    // ------------------------------------------------------------
    // SEGMENT SERIES (CMC-style green/red shading)
    // ------------------------------------------------------------
    for (const seg of segs) {
        const color = seg.rising ? "#16c784" : "#ea3943";
        const fill = seg.rising
            ? "rgba(22,199,132,0.25)"
            : "rgba(234,57,67,0.25)";

        const series = chart.addAreaSeries({
            lineWidth: 2,
            lineColor: color,
            topColor: fill,
            bottomColor: fill,
        });

        series.setData(
            seg.points.map((p: HistoryPoint) => ({
                time: p.time as UTCTimestamp,
                value: p.value,
            }))
        );
    }

    chart.timeScale().fitContent();

    // ------------------------------------------------------------
    // TOOLTIP ELEMENT
    // ------------------------------------------------------------
    let tooltip = tooltipRef.current;
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.style.position = "absolute";
        tooltip.style.zIndex = "9999";
        tooltip.style.pointerEvents = "none";
        tooltip.style.padding = "10px 14px";
        tooltip.style.borderRadius = "8px";
        tooltip.style.background = "rgba(255,255,255,0.98)";
        tooltip.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
        tooltip.style.fontSize = "13px";
        tooltip.style.fontWeight = "500";
        tooltip.style.color = "#111";
        tooltip.style.visibility = "hidden";
        container.appendChild(tooltip);
        tooltipRef.current = tooltip;
    }

    // ------------------------------------------------------------
    // TOOLTIP CROSSHAIR
    // ------------------------------------------------------------
    chart.subscribeCrosshairMove((param) => {
        const sd = param.seriesData.get(mainSeries) as
            | { value: number }
            | undefined;

        const price = sd?.value;

        if (!price || !param.point) {
            tooltip.style.visibility = "hidden";
            return;
        }

        const t = param.time as number;
        const ts = new Date(t * 1000);

        const dateStr = ts.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });

        const timeStr = ts.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        });

        tooltip.innerHTML = `
            <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">
                ${dateStr} — ${timeStr}
            </div>
            <div style="font-size:15px; font-weight:600;">
                ${fmt(price)}
            </div>
        `;

        const { x, y } = param.point;
        const w = tooltip.clientWidth;
        const h = tooltip.clientHeight;

        tooltip.style.left = `${Math.min(
            Math.max(x - w / 2, 0),
            container.clientWidth - w
        )}px`;

        tooltip.style.top = `${y - h - 12}px`;
        tooltip.style.visibility = "visible";
    });

    // Resize handling
    const handleResize = () => {
        chart.resize(container.clientWidth, 400);
    };
    window.addEventListener("resize", handleResize);
}, [fromCoin, toCoin, range, getNormalizedHistory]);



    // ------------------------------------------------------------
    // UI RENDER
    // ------------------------------------------------------------
    const renderRow = useCallback(
        (coin: Coin, type: "from" | "to") => {
            const disabled =
                (type === "from" && coin.id === toCoin?.id) ||
                (type === "to" && coin.id === fromCoin?.id);

            const selected =
                (type === "from" && coin.id === fromCoin?.id) ||
                (type === "to" && coin.id === toCoin?.id);

            let cls = "dropdown-row";
            if (selected) cls += " dropdown-selected";
            if (disabled) cls += " dropdown-disabled";

            return (
                <div
                    key={coin.id}
                    className={cls}
                    onClick={() => {
                        if (!disabled) {
                            type === "from"
                                ? setFromCoin(coin)
                                : setToCoin(coin);
                        }
                        setOpenDropdown(null);
                        setFromSearch("");
                        setToSearch("");
                    }}
                >
                    <img src={coin.image} className="dropdown-flag" />
                    <div>
                        <div className="dropdown-symbol">{coin.symbol}</div>
                        <div className="dropdown-name">{coin.name}</div>
                    </div>
                </div>
            );
        },
        [fromCoin, toCoin]
    );

    const renderDropdown = useCallback(
        (type: "from" | "to") => {
            const search = type === "from" ? fromSearch : toSearch;
            const setSearch = type === "from" ? setFromSearch : setToSearch;

            return (
                <div className="dropdown-panel">
                    <input
                        className="dropdown-search"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {filteredCoins(search).map((c) =>
                        renderRow(c, type)
                    )}
                </div>
            );
        },
        [filteredCoins, fromSearch, toSearch, renderRow]
    );

    const RangeButtons = () => {
        const ranges = ["24H", "7D", "1M", "3M", "6M", "1Y"];
        return (
            <div style={{ textAlign: "center", marginTop: "35px" }}>
                {ranges.map((r) => (
                    <button
                        key={r}
                        onClick={() => setRange(r)}
                        style={{
                            margin: "0 4px",
                            padding: "8px 14px",
                            borderRadius: "8px",
                            border: "1px solid var(--card-border)",
                            background:
                                range === r ? "var(--accent)" : "var(--card-bg)",
                            color: range === r ? "#fff" : "var(--text)",
                            cursor: "pointer",
                            fontSize: "14px",
                        }}
                    >
                        {r}
                    </button>
                ))}
            </div>
        );
    };

    const renderResult = () => {
        if (!result || !fromCoin || !toCoin) return null;
        const baseRate = result / Number(amount);
        return (
            <div style={{ textAlign: "center", marginTop: "40px" }}>
                <div style={{ fontSize: "22px", opacity: 0.65 }}>
                    1 {fromCoin.symbol} → {toCoin.symbol}
                </div>
                <div style={{ fontSize: "60px", fontWeight: 700, marginTop: "10px" }}>
                    {result.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                    })}{" "}
                    {toCoin.symbol}
                </div>
                <div style={{ marginTop: "10px", opacity: 0.7 }}>
                    1 {fromCoin.symbol} ={" "}
                    {baseRate.toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                    })}{" "}
                    {toCoin.symbol}
                    <br />
                    1 {toCoin.symbol} ={" "}
                    {(1 / baseRate).toLocaleString(undefined, {
                        maximumFractionDigits: 8,
                    })}{" "}
                    {fromCoin.symbol}
                </div>
            </div>
        );
    };

    return (
        <div style={{ maxWidth: "1150px", margin: "0 auto", padding: "22px" }}>
            <div style={{ textAlign: "right", marginBottom: "10px" }}>
                <ThemeToggle />
            </div>

            {/* AMOUNT / FROM / SWAP / TO */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-start",
                    gap: "32px",
                    flexWrap: "wrap",
                    marginTop: "10px",
                }}
            >
                {/* AMOUNT */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <h3>AMOUNT</h3>
                    <input
                        value={amount}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (
                                v === "" ||
                                /^[0-9]*\.?[0-9]*$/.test(v)
                            ) {
                                setAmount(v);
                            }
                        }}
                        className="selector-box"
                        style={{ width: "260px" }}
                    />
                    {(amount === "" || Number(amount) <= 0) && (
                        <div
                            style={{
                                color: "red",
                                marginTop: "6px",
                                fontSize: "14px",
                            }}
                        >
                            Enter a Number Greater than 0
                        </div>
                    )}
                </div>

                {/* FROM */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        position: "relative",
                    }}
                >
                    <h3>FROM</h3>
                    <div
                        className="selector-box"
                        onClick={() => {
                            setOpenDropdown(
                                openDropdown === "from" ? null : "from"
                            );
                            setFromSearch("");
                        }}
                    >
                        {fromCoin && (
                            <>
                                <img
                                    src={fromCoin.image}
                                    className="selector-img"
                                />
                                <div>
                                    <div className="selector-symbol">
                                        {fromCoin.symbol}
                                    </div>
                                    <div className="selector-name">
                                        {fromCoin.name}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    {openDropdown === "from" && renderDropdown("from")}
                </div>

                {/* SWAP */}
                <div
                    className="swap-circle"
                    style={{ marginTop: "38px" }}
                    onClick={() => {
                        if (fromCoin && toCoin) {
                            const tmp = fromCoin;
                            setFromCoin(toCoin);
                            setToCoin(tmp);
                        }
                    }}
                >
                    <div className="swap-icon" />
                </div>

                {/* TO */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        position: "relative",
                    }}
                >
                    <h3>TO</h3>
                    <div
                        className="selector-box"
                        onClick={() => {
                            setOpenDropdown(
                                openDropdown === "to" ? null : "to"
                            );
                            setToSearch("");
                        }}
                    >
                        {toCoin && (
                            <>
                                <img
                                    src={toCoin.image}
                                    className="selector-img"
                                />
                                <div>
                                    <div className="selector-symbol">
                                        {toCoin.symbol}
                                    </div>
                                    <div className="selector-name">
                                        {toCoin.name}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    {openDropdown === "to" && renderDropdown("to")}
                </div>
            </div>

            {/* RESULT */}
            {renderResult()}

            {/* RANGE BUTTONS */}
            <RangeButtons />

            {/* CHART */}
            <div
                ref={chartContainerRef}
                style={{
                    width: "100%",
                    height: "400px",
                    marginTop: "35px",
                    borderRadius: "14px",
                    border: "1px solid var(--card-border)",
                    background: "var(--card-bg)",
                    position: "relative",
                }}
            />
        </div>
    );
}
