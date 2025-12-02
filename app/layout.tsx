"use client";

import { useEffect } from "react";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Apply saved theme on client after mount
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(saved);
  }, []);

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
