import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "sonner";
import ZoomBlocker from "@/components/zoom-blocker";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "CofrinhoGordinho",
  description: "Seu porquinho de investimentos",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} dark`}>
      <body className="antialiased">
        <ZoomBlocker />
        <AuthProvider>{children}</AuthProvider>
        <Toaster theme="dark" position="bottom-center" richColors />
      </body>
    </html>
  );
}
