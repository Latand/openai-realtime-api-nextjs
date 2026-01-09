import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "../globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Transcription",
  description: "Live transcription overlay",
};

export default function OverlayLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={geistSans.variable}
        style={{
          background: "transparent",
          margin: 0,
          padding: 0,
          overflow: "hidden",
        }}
      >
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
