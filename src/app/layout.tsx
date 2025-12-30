import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Cormorant } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import { OrganizationSchema } from "@/components/seo/json-ld";
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

const BASE_URL = "https://postboxd.co.uk";

/**
 * Comprehensive metadata for SEO and social sharing
 * Includes Open Graph, Twitter Cards, and verification tags
 */
export const metadata: Metadata = {
  // Basic metadata
  title: {
    default: "Postboxd - London Cinema Calendar",
    template: "%s | Postboxd",
  },
  description:
    "Find screenings at London's independent cinemas. Daily updated listings from BFI Southbank, Prince Charles Cinema, Curzon, Picturehouse, ICA, Barbican, and 15+ venues.",
  keywords: [
    "London cinema",
    "film listings",
    "independent cinema",
    "BFI Southbank",
    "Prince Charles Cinema",
    "art house cinema",
    "repertory cinema",
    "London film",
    "cinema calendar",
    "movie showtimes",
  ],

  // Canonical and alternate URLs
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: "/",
  },

  // Open Graph for Facebook, LinkedIn, etc.
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: BASE_URL,
    siteName: "Postboxd",
    title: "Postboxd - London Cinema Calendar",
    description:
      "Find screenings at London's independent cinemas. BFI, Prince Charles, Curzon, Picturehouse, ICA, and more. Updated daily.",
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Postboxd - London Cinema Calendar",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Postboxd - London Cinema Calendar",
    description:
      "Find screenings at London's independent cinemas. Updated daily with showtimes from 15+ venues.",
    images: [`${BASE_URL}/og-image.png`],
    creator: "@postboxd",
  },

  // Robots directives
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Icons
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },

  // Verification (add your actual verification codes)
  // verification: {
  //   google: "your-google-verification-code",
  //   other: {
  //     "msvalidate.01": "your-bing-verification-code",
  //   },
  // },

  // App info
  applicationName: "Postboxd",
  authors: [{ name: "Postboxd" }],
  generator: "Next.js",
  category: "Entertainment",
};

/**
 * Viewport configuration
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1E3A5F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} ${cormorant.variable} antialiased bg-background-primary text-text-primary`}
      >
        {/* Organization schema for brand recognition */}
        <OrganizationSchema />
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: "#1E3A5F",
              colorText: "#1A1A1A",
              colorTextSecondary: "#4A4A4A",
              colorBackground: "#FFFFFF",
              colorInputBackground: "#EDE8DD",
              colorInputText: "#1A1A1A",
              borderRadius: "0.5rem",
            },
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
