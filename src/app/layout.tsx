import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Cormorant } from "next/font/google";
import localFont from "next/font/local";
import { ClerkProviderConditional } from "@/components/clerk-provider-conditional";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const ttSlabs = localFont({
  src: [
    {
      path: "../../public/fonts/tt-slabs-regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/tt-slabs-bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-tt-slabs",
  display: "swap",
});

// This app serves the API and admin only; pictures.london (frontend/) is the public site.
export const metadata: Metadata = {
  title: "Pictures Admin",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dark` reproduces what the deleted theme-init.js applied by default.
    <html lang="en" className="dark">
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} ${cormorant.variable} ${ttSlabs.variable} antialiased bg-background-primary text-text-primary`}
      >
        <ClerkProviderConditional>{children}</ClerkProviderConditional>
      </body>
    </html>
  );
}
