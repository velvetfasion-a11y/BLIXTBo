import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Fraunces } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const sans = Familjen_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-familjen",
  display: "swap",
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Blixtbo",
  description: "Var först på varje ny hyreslägenhet. Håll koll på ansökningar och köer.",
};

export const viewport: Viewport = {
  themeColor: "#F3F0EA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper font-sans text-ink">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
