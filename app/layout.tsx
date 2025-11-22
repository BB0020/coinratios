"use client";

import { useState, useEffect } from "react";
import "./globals.css";

export const metadata = {
  title: "CoinRatios",
  description: "Compare any two crypto coins by ratio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <html lang="en">
      <body>
        <div className="theme-toggle-container">
          <button
            className="theme-toggle-btn"
            onClick={() =>
              setTheme(theme === "light" ? "dark" : "light")
            }
          >
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>

        {children}
      </body>
    </html>
  );
}
