"use client";

import { useEffect, useState } from "react";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState("light");

  /* Load saved theme */
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) setTheme(saved);
  }, []);

  /* Apply theme to <html> */
  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <html>
      <body>
        {/* Header theme toggle */}
        <div style={{ textAlign: "right", padding: "16px 22px" }}>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              color: "var(--text)",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
          </button>
        </div>

        {children}
      </body>
    </html>
  );
}
