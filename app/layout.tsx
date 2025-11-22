export const metadata = {
  title: "CoinRatios",
  description: "Compare any two crypto coins by ratio",
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
