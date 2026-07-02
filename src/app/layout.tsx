import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const cormorantGaramond = localFont({
  src: "../../public/CormorantGaramond-Light.ttf",
  display: "swap",
  weight: "300",
});

export const metadata: Metadata = {
  title: "Bellwether Band",
  description: "Bellwether Band",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cormorantGaramond.className}>{children}</body>
    </html>
  );
}
