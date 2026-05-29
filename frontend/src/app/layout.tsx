import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "sonner";
import ZoomBlocker from "@/components/zoom-blocker";
import PushNotificationClickHandler from "@/components/push-notification-click-handler";
import { Suspense } from "react";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "CofrinhoGordinho",
  description: "Seu porquinho de investimentos",
  applicationName: "CofrinhoGordinho",
  appleWebApp: {
    capable: true,
    title: "Cofrinho",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
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
        <AuthProvider>
          <Suspense fallback={null}>
            <PushNotificationClickHandler />
          </Suspense>
          {children}
        </AuthProvider>
        <Toaster theme="dark" position="bottom-center" richColors />
      </body>
    </html>
  );
}
