import "./globals.css";
import type { Metadata } from "next";
import ThemeToggle from "./ThemeToggle";

export const metadata: Metadata = {
  title: "Crypto Ratio Converter",
  description: "Convert crypto & fiat with charts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body>
        {/* FIXED TOP-RIGHT TOGGLE */}
        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        {children}
      </body>
    </html>
  );
}
