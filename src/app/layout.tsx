import type { Metadata } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EvidencePerceptionBridge } from "@/components/evidence/EvidencePerceptionBridge";
import NumericInputSafety from "@/components/overhaul/NumericInputSafety";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ variable: "--font-ibm-plex-mono", weight: ["400", "500"], subsets: ["latin"], display: "swap" });

export const metadata: Metadata = { title: "Overhaul — Retrofit Decision Engine", description: "Evidence-first retrofit intelligence combining AI perception with deterministic engineering validation." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${fraunces.variable} ${inter.variable} ${ibmPlexMono.variable} h-full antialiased`}><body className="blueprint-grid min-h-full flex flex-col bg-navy text-paper"><ErrorBoundary>{children}<NumericInputSafety /><EvidencePerceptionBridge /></ErrorBoundary></body></html>;
}
