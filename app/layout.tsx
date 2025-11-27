"use client";

import "./globals.css";
import { useEffect, useState } from "react";

export const metadata = {
  title: "Coin Ratios",
  description: "Crypto & fiat ratio converter with charts",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState("light");

  // Load initial theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.className = saved;
    }
  }, []);

  // Apply theme + store in localStorage
  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  return (
    <html lang="en">
      <body>
        {/* UPGRADED THEME TOGGLE */}
        <button
          onClick={toggleTheme}
          className={`theme-toggle ${theme === "dark" ? "dark-mode" : ""}`}
        >
          <div className="toggle-slider">
            <span className="icon sun">☀️</span>
            <span className="icon moon">🌙</span>
          </div>
        </button>

        {children}
      </body>
    </html>
  );
}
