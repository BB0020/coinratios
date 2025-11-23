"use client";

import { useState, useEffect } from "react";
import axios from "axios";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  flag?: string;
  isFiat?: boolean;
}

const fiatCurrencies: Coin[] = [
  {
    id: "usd",
    symbol: "usd",
    name: "US Dollar",
    flag: "https://flagcdn.com/us.svg",
    isFiat: true,
  },
  {
    id: "eur",
    symbol: "eur",
    name: "Euro",
    flag: "https://flagcdn.com/eu.svg",
    isFiat: true,
  },
  {
    id: "gbp",
    symbol: "gbp",
    name: "British Pound",
    flag: "https://flagcdn.com/gb.svg",
    isFiat: true,
  },
  {
    id: "cad",
    symbol: "cad",
    name: "Canadian Dollar",
    flag: "https://flagcdn.com/ca.svg",
    isFiat: true,
  },
  {
    id: "aud",
    symbol: "aud",
    name: "Australian Dollar",
    flag: "https://flagcdn.com/au.svg",
    isFiat: true,
  },
];

export default function Home() {
  const [crypto, setCrypto] = useState<Coin[]>([]);
  const [amount, setAmount] = useState("1");

  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);

  const [dropdownTarget, setDropdownTarget] = useState<"from" | "to" | null>(
    null
  );
  const [search, setSearch] = useState("");

  const [result, setResult] = useState<number | null>(null);

  // Load top 200 crypto coins
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1"
      )
      .then((res) => setCrypto(res.data));
  }, []);

  // Default selection (BTC → USD)
  useEffect(() => {
    if (crypto.length > 0) {
      const btc = crypto.find((c) => c.symbol === "btc");
      const usd = fiatCurrencies[0];

      if (btc && usd) {
        setFromCoin(btc);
        setToCoin(usd);
      }
    }
  }, [crypto]);

  // Perform conversion
  useEffect(() => {
    const run = async () => {
      if (!fromCoin || !toCoin || !amount) return;

      const ids = [];

      if (!fromCoin.isFiat) ids.push(fromCoin.id);
      if (!toCoin.isFiat) ids.push(toCoin.id);

      const priceRes = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(
          ","
        )}&vs_currencies=usd`
      );

      const getUsdValue = (coin: Coin) => {
        if (coin.isFiat) {
          const rates: any = {
            usd: 1,
            eur: 1.08,
            gbp: 1.27,
            cad: 0.74,
            aud: 0.66,
          };
          return 1 / rates[coin.symbol];
        } else {
          return priceRes.data[coin.id].usd;
        }
      };

      const a = getUsdValue(fromCoin);
      const b = getUsdValue(toCoin);

      setResult((parseFloat(amount) * a) / b);
    };

    run();
  }, [fromCoin, toCoin, amount]);

  const allCoins = [...crypto, ...fiatCurrencies];

  const filteredCoins = allCoins.filter((c) =>
    `${c.name} ${c.symbol}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <label className="coin-label">AMOUNT</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="amount-input"
      />

      {/* FROM */}
      <div className="coin-label" style={{ marginTop: 34 }}>
        FROM
      </div>

      <div
        className="coin-box"
        onClick={() => setDropdownTarget("from")}
      >
        {fromCoin && (
          <div className="coin-row">
            <img
              src={fromCoin.isFiat ? fromCoin.flag : fromCoin.image}
              className={fromCoin.isFiat ? "flag-icon" : "crypto-icon"}
            />
            <div className="coin-info">
              <div className="coin-symbol">{fromCoin.symbol.toUpperCase()}</div>
              <div className="coin-name">{fromCoin.name}</div>
            </div>
          </div>
        )}

        {dropdownTarget === "from" && (
          <div className="dropdown">
            <input
              placeholder="Search all…"
              className="dropdown-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {filteredCoins.map((c) => (
              <div
                key={c.id}
                className="dropdown-item"
                onClick={() => {
                  setFromCoin(c);
                  setDropdownTarget(null);
                  setSearch("");
                }}
              >
                <img
                  src={c.isFiat ? c.flag : c.image}
                  className={c.isFiat ? "flag-icon" : "crypto-icon"}
                />

                <div>
                  <div className="dropdown-symbol">
                    {c.symbol.toUpperCase()}
                  </div>
                  <div className="dropdown-name">{c.name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Swap button */}
      <div
        className="swap-btn"
        onClick={() => {
          const a = fromCoin;
          const b = toCoin;
          setFromCoin(b);
          setToCoin(a);
        }}
      >
        <svg
          className="swap-arrow"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path d="M7 7h10M13 3l4 4-4 4M17 17H7m4 4l-4-4 4-4" />
        </svg>
      </div>

      {/* TO */}
      <div className="coin-label">TO</div>

      <div
        className="coin-box"
        onClick={() => setDropdownTarget("to")}
      >
        {toCoin && (
          <div className="coin-row">
            <img
              src={toCoin.isFiat ? toCoin.flag : toCoin.image}
              className={toCoin.isFiat ? "flag-icon" : "crypto-icon"}
            />

            <div className="coin-info">
              <div className="coin-symbol">{toCoin.symbol.toUpperCase()}</div>
              <div className="coin-name">{toCoin.name}</div>
            </div>
          </div>
        )}

        {dropdownTarget === "to" && (
          <div className="dropdown">
            <input
              placeholder="Search all…"
              className="dropdown-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {filteredCoins.map((c) => (
              <div
                key={c.id}
                className="dropdown-item"
                onClick={() => {
                  setToCoin(c);
                  setDropdownTarget(null);
                  setSearch("");
                }}
              >
                <img
                  src={c.isFiat ? c.flag : c.image}
                  className={c.isFiat ? "flag-icon" : "crypto-icon"}
                />

                <div>
                  <div className="dropdown-symbol">
                    {c.symbol.toUpperCase()}
                  </div>
                  <div className="dropdown-name">{c.name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RESULT */}
      {result !== null && fromCoin && toCoin && (
        <div style={{ marginTop: 60, textAlign: "center" }}>
          <div
            style={{
              fontSize: 22,
              marginBottom: 14,
              color: "var(--text-secondary)",
            }}
          >
            {amount} {fromCoin.symbol.toUpperCase()} → {toCoin.symbol.toUpperCase()}
          </div>

          <div style={{ fontSize: 58, fontWeight: 700 }}>
            {result.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}{" "}
            {toCoin.symbol.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
