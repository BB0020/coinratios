"use client";

import { useEffect } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {

  // Initialize theme ONCE
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.classList.add(saved);
  }, []);

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.classList.contains("dark") ? "light" : "dark";

    html.classList.remove("light", "dark");
    html.classList.add(next);
    localStorage.setItem("theme", next);

    window.dispatchEvent(new Event("theme-change"));
  }

  return (
    <html>
      <body>
        <div style={{ textAlign: "right", padding: "16px 22px" }}>
          <button
            onClick={toggleTheme}
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
            Toggle Theme
          </button>
        </div>

        {children}
      </body>
    </html>
  );
}
