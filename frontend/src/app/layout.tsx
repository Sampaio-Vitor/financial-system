import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "CofrinhoGordinho",
  description: "Seu porquinho de investimentos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} dark`}>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster theme="dark" position="bottom-center" richColors />
      </body>
    </html>
  );
}
