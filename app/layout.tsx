"use client";

import "./globals.css";
import { Inter } from "next/font/google";
import ThemeToggle from "./ThemeToggle";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Theme Toggle floating top-right */}
        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        {/* Main content */}
        {children}
      </body>
    </html>
  );
}
