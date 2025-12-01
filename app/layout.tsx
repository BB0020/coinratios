import "./globals.css";
import { useEffect } from "react";
import ThemeToggle from "./ThemeToggle";

export const metadata = {
  title: "CoinRatios",
  description: "Crypto & Fiat Conversion and Ratio Charts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        {/* CLIENT THEME LOADER */}
        <ThemeInitializer />

        {/* Theme Toggle button in header */}
        <div style={{ textAlign: "right", padding: "16px 22px" }}>
          <ThemeToggle />
        </div>

        {children}
      </body>
    </html>
  );
}

/* ----------------------------------------------------------
   CLIENT COMPONENT INSIDE SAME FILE
   (keeps layout a server component)
-----------------------------------------------------------*/
function ThemeInitializer() {
  // Mark this as a client component
  "use client";

  useEffect(() => {
    // Load saved theme
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.classList.add(saved);
  }, []);

  return null;
}
