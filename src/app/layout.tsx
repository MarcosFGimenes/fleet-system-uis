import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestão de Frota - Sistema de Manutenção",
  description: "Sistema moderno para gestão de checklists, não conformidades e manutenção da frota",
  keywords: ["gestão", "frota", "manutenção", "checklist", "não conformidades"],
  authors: [{ name: "Gestão de Frota" }],
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#2563EB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="light">
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body
        className={`${inter.variable} bg-background text-foreground antialiased font-sans`}
      >
        <div className="min-h-screen flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
