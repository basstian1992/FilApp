import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FilApp | Gestor de Filas",
  description: "Sistema premium de gestión de filas y atención de usuarios.",
};

import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToastProvider } from "@/components/Toast";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <ToastProvider>
            {children}
            <ThemeToggle />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
