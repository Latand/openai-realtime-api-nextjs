import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

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
          "min-h-dvh bg-black font-sans antialiased",
          geistSans.variable
        )}
      >
        <div className="relative flex min-h-dvh flex-col bg-black items-center">
          <main className="flex flex-1 justify-center items-center w-full">
            {children}
          </main>
        </div>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
