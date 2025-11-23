import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CoinRatios",
  description: "Compare any two crypto or fiat currencies by ratio.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
