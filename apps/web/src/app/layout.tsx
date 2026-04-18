import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Sora } from "next/font/google";

import { ConvexClientProvider } from "@/app/ConvexClientProvider";

import "./globals.css";

const headingFont = Sora({
  variable: "--font-heading-display",
  subsets: ["latin"],
});

const bodyFont = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const monoFont = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cortent",
  description:
    "Cortent is a clean creator SaaS with a brain-style scan viewer, structured action board, saved scan history, and deadspace-first export workflow.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground flex flex-col">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
