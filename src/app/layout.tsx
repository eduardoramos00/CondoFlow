import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/layout/Providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CondoFlow",
    template: "%s — CondoFlow",
  },
  description: "Plataforma premium de gestão de condomínios",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt" className={`${inter.variable} dark h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
