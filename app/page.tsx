"use client";

import { useState, useEffect } from "react";
import axios from "axios";

/* ------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------ */
interface Currency {
  id: string;
  symbol: string;
  name: string;
  image: string;
  isFiat?: boolean;
}

/* ------------------------------------------------------ */
/* Fiat Currency List */
/* ------------------------------------------------------ */
const FIAT: Currency[] = [
  { id: "usd", symbol: "USD", name: "US Dollar", image: "/flags/us.svg", isFiat: true },
  { id: "eur", symbol: "EUR", name: "Euro", image: "/flags/eu.svg", isFiat: true },
  { id: "gbp", symbol: "GBP", name: "British Pound", image: "/flags/gb.svg", isFiat: true },
  { id: "cad", symbol: "CAD", name: "Canadian Dollar", image: "/flags/ca.svg", isFiat: true },
  { id: "aud", symbol: "AUD", name: "Australian Dollar", image: "/flags/au.svg", isFiat: true },
];

/* ------------------------------------------------------ */
/* Component */
/* ------------------------------------------------------ */
export default function Home() {
  const [cryptoList, setCryptoList] = useState<Currency[]>([]);
  const [openDropdown, setOpenDropdown] = useState<"from" | "to" | null>(null);

  const [amount, setAmount] = useState("1");

  const [from, setFrom] = useState<Currency | null>(null);
  const [to, setTo] = useState<Currency | null>(null);

  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");

  const [result, setResult] = useState<number | null>(null);
  const [inverse, setInverse] = useState<number | null>(null);

  /* ------------------------------------------------------ */
  /* Load Crypto List */
  /* ------------------------------------------------------ */
  useEffect(() => {
    axios
      .get(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1"
      )
      .then((res) => {
        setCryptoList(
          res.data.map((c: any) => ({
            id: c.id,
            symbol: c.symbol.toUpperCase(),
            name: c.name,
            image: c.image,
          }))
        );
      })
      .catch(console.error);
  }, []);

  /* ------------------------------------------------------ */
  /* Set Default Values Once List Loads */
  /* ------------------------------------------------------ */
  useEffect(() => {
    if (cryptoList.length > 0 && !from && !to) {
      const btc = cryptoList.find((x) => x.symbol === "BTC");
      const usd = FIAT.find((x) => x.symbol === "USD");

      if (btc && usd) {
        setFrom(btc);
        setTo(usd);
      }
    }
  }, [cryptoList]);

  /* ------------------------------------------------------ */
  /* Calculate Conversion */
  /* ------------------------------------------------------ */
  useEffect(() => {
    if (!from || !to || !amount) return;

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      setResult(null);
      return;
    }

    const fetchPrices = async () => {
      const ids = [from.id, to.id].join(",");

      const res = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
      );

      const priceFrom = res.data[from.id]?.usd;
      const priceTo = res.data[to.id]?.usd;

      if (!priceFrom || !priceTo) return;

      const ratio = (priceFrom / priceTo) * amt;
      const reverseRatio = priceTo / priceFrom;

      setResult(ratio);
      setInverse(reverseRatio);
    };

    fetchPrices();
  }, [from, to, amount]);

  /* ------------------------------------------------------ */
  /* Filtering */
  /* ------------------------------------------------------ */
  const allCurrencies = [...FIAT, ...cryptoList];

  const filteredFrom = allCurrencies.filter((c) =>
    `${c.symbol} ${c.name}`.toLowerCase().includes(searchFrom.toLowerCase())
  );

  const filteredTo = allCurrencies.filter((c) =>
    `${c.symbol} ${c.name}`.toLowerCase().includes(searchTo.toLowerCase())
  );

  /* ------------------------------------------------------ */
  /* Swap */
  /* ------------------------------------------------------ */
  const swap = () => {
    const a = from;
    const b = to;
    setFrom(b);
    setTo(a);
  };

  /* ------------------------------------------------------ */
  /* UI */
/* ------------------------------------------------------ */
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 40 }}>
      
      {/* Amount */}
      <div style={{ marginBottom: 25 }}>
        <label>Amount</label>
        <input
          className="amount-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {(!amount || Number(amount) <= 0) && (
          <div className="amount-warning">
            Amount needs to be a number and greater than 0.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
        
        {/* FROM */}
        <div style={{ flex: 1 }}>
          <label>FROM</label>

          <div
            className="card-coin"
            onClick={() => setOpenDropdown(openDropdown === "from" ? null : "from")}
          >
            {from && (
              <div style={{ display: "flex", alignItems: "center" }}>
                <img src={from.image} width={32} height={32} />
                <div style={{ marginLeft: 12 }}>
                  <div style={{ fontWeight: 600 }}>{from.symbol}</div>
                  <div style={{ opacity: 0.7 }}>{from.name}</div>
                </div>
              </div>
            )}
          </div>

          <div className={`dropdown-panel ${openDropdown === "from" ? "open" : ""}`}>
            <input
              className="dropdown-search"
              placeholder="Search all..."
              value={searchFrom}
              onChange={(e) => setSearchFrom(e.target.value)}
            />

            {filteredFrom.map((c) => (
              <div
                key={c.id}
                className="dropdown-item"
                onClick={() => {
                  setFrom(c);
                  setOpenDropdown(null);
                  setSearchFrom("");
                }}
              >
                <img src={c.image} />
                <span className="dropdown-item-symbol">{c.symbol}</span>
                <span className="dropdown-item-name">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Swap Button */}
        <div className="swap-btn" onClick={swap}>
          <img src="/swap.svg" />
        </div>

        {/* TO */}
        <div style={{ flex: 1 }}>
          <label>TO</label>

          <div
            className="card-coin"
            onClick={() => setOpenDropdown(openDropdown === "to" ? null : "to")}
          >
            {to && (
              <div style={{ display: "flex", alignItems: "center" }}>
                <img src={to.image} width={32} height={32} />
                <div style={{ marginLeft: 12 }}>
                  <div style={{ fontWeight: 600 }}>{to.symbol}</div>
                  <div style={{ opacity: 0.7 }}>{to.name}</div>
                </div>
              </div>
            )}
          </div>

          <div className={`dropdown-panel ${openDropdown === "to" ? "open" : ""}`}>
            <input
              className="dropdown-search"
              placeholder="Search all..."
              value={searchTo}
              onChange={(e) => setSearchTo(e.target.value)}
            />

            {filteredTo.map((c) => (
              <div
                key={c.id}
                className="dropdown-item"
                onClick={() => {
                  setTo(c);
                  setOpenDropdown(null);
                  setSearchTo("");
                }}
              >
                <img src={c.image} />
                <span className="dropdown-item-symbol">{c.symbol}</span>
                <span className="dropdown-item-name">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Result */}
      {result !== null && (
        <div style={{ marginTop: 60, textAlign: "center" }}>
          <div style={{ fontSize: 18, opacity: 0.7 }}>
            1 {from?.symbol} → {to?.symbol}
          </div>
          <div style={{ fontSize: 60, fontWeight: 700 }}>
            {result.toFixed(6)} {to?.symbol}
          </div>

          <div style={{ marginTop: 10, opacity: 0.7 }}>
            1 {from?.symbol} = {inverse?.toFixed(6)} {to?.symbol}
            <br />
            1 {to?.symbol} = {(1 / inverse!).toFixed(6)} {from?.symbol}
          </div>
        </div>
      )}
    </div>
  );
}
