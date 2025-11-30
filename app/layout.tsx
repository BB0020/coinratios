"use client";

import { useEffect } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {

  // 1) Ensure theme is applied BEFORE hydration to avoid light/dark flash
  useEffect(() => {
    let saved = localStorage.getItem("theme");
    if (!saved) {
      saved = "light";
      localStorage.setItem("theme", "light");
    }
    document.documentElement.classList.add(saved);
  }, []);

  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
