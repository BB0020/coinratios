import "./globals.css";
import ThemeToggle from "./ThemeToggle";
import ThemeInit from "./ThemeInit";

export const metadata = {
  title: "CoinRatios",
  description: "Crypto & Fiat Conversion and Ratio Charts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        {/* Inject saved theme early */}
        <ThemeInit />

        {/* Theme toggle in header */}
        <div style={{ textAlign: "right", padding: "16px 22px" }}>
          <ThemeToggle />
        </div>

        {children}
      </body>
    </html>
  );
}
