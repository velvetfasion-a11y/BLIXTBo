import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Fraunces } from "next/font/google";
import { JsonLd } from "@/components/json-ld";
import { StoreProvider } from "@/lib/store";
import { HOME_DESCRIPTION, HOME_TITLE, organizationJsonLd } from "@/lib/seo";
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
  metadataBase: new URL("https://blixtbo.se"),
  title: {
    default: HOME_TITLE,
    template: "%s | Blixtbo",
  },
  description: HOME_DESCRIPTION,
  applicationName: "Blixtbo",
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Blixtbo",
    url: "/",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
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
        <JsonLd data={organizationJsonLd()} />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
