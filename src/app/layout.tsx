import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Internes Mitarbeiterportal der Mining Adventure World",
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
