export const metadata = {
  title: "CoinRatios",
  description: "Real-time crypto & fiat ratios",
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
