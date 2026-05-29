import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAW Internal Portal",
  description: "Internes Unternehmensportal der Mining Adventure World",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
