import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "CoinRatios",
  description: "Live crypto & fiat pair converter with charts",
};

// ❗ This MUST remain a server component (NO "use client")
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="light">
        {children}
      </body>
    </html>
  );
}
