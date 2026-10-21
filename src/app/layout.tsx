import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Opportunity Shield",
  description: "A personal AI agent that vets paid opportunities and exposes bounty traps — powered by NVIDIA Nemotron on Nebius Token Factory and Tavily.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Nav />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-12">{children}</main>
        <footer className="mx-auto w-full max-w-4xl px-4 pb-8 text-xs text-zinc-400">
          NVIDIA Nemotron on Nebius Token Factory · web data by Tavily · MIT licensed
        </footer>
      </body>
    </html>
  );
}
