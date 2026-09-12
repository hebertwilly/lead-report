import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Lead Report", description: "Acompanhamento diário de leads e resultados comerciais." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
