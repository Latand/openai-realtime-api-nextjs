import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "../globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { DevToolsButton } from "@/components/dev-tools-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voice Assistant",
  description: "Voice Assistant powered by OpenAI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={cn(
          "h-screen w-screen overflow-hidden bg-transparent font-sans antialiased",
          geistSans.variable
        )}
      >
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
