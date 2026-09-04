import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "فیتا | تغذیه هوشمند",
  description:
    "فیتا — ثبت غذا با عکس، برنامه غذایی 7 روزه شخصی‌سازی‌شده و مربی هوشمند تغذیه",
  applicationName: "Fita",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f9f9f9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
