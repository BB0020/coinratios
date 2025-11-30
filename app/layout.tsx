import "./globals.css";
import ThemeToggle from "./ThemeToggle";

export const metadata = {
  title: "Coin Ratios",
  description: "Crypto & fiat conversion ratios",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* THEME TOGGLE (fixed top-right corner) */}
        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        {/* PAGE CONTENT */}
        {children}
      </body>
    </html>
  );
}
