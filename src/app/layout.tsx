import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Cormorant } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import { OrganizationSchema } from "@/components/seo/json-ld";
import { Footer } from "@/components/layout/footer";
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

const BASE_URL = "https://pictures.london";

/**
 * Comprehensive metadata for SEO and social sharing
 * Includes Open Graph, Twitter Cards, and verification tags
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    // Basic metadata
  title: {
    default: "Pictures - London Cinema Listings | Showtimes | Festivals",
    template: "%s | Pictures",
  },
  description:
    "Find screenings at London cinemas. Daily updated listings from BFI Southbank, Prince Charles Cinema, Curzon, Picturehouse, ICA, Barbican, Odeon, and 20+ venues.",
  keywords: [
    "London cinema",
    "film listings",
    "independent cinema",
    "BFI Southbank",
    "Prince Charles Cinema",
    "art house cinema",
    "repertory cinema",
    "London film",
    "cinema listings",
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
    siteName: "Pictures",
    title: "Pictures - London Cinema Listings | Showtimes | Festivals",
    description:
      "Find screenings at London cinemas. BFI, Prince Charles, Curzon, Picturehouse, ICA, Odeon, and more. Updated daily.",
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Pictures - London Cinema Listings",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "Pictures - London Cinema Listings | Showtimes | Festivals",
    description:
      "Find screenings at London cinemas. Updated daily with showtimes from 20+ venues.",
    images: [`${BASE_URL}/og-image.png`],
    creator: "@pictureslondon",
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

  // Icons - multiple sizes for different contexts
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "icon", url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { rel: "icon", url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },

  // Web App Manifest for PWA
  manifest: "/manifest.json",

  // Verification (add your actual verification codes)
  // verification: {
  //   google: "your-google-verification-code",
  //   other: {
  //     "msvalidate.01": "your-bing-verification-code",
  //   },
  // },

    // App info
    applicationName: "Pictures",
    authors: [{ name: "Pictures" }],
    generator: "Next.js",
    category: "Entertainment",
  };
}

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Theme initialization script - prevents flash of wrong theme */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} ${cormorant.variable} ${ttSlabs.variable} antialiased bg-background-primary text-text-primary`}
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
          <Providers>
            <div className="min-h-screen flex flex-col">
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </Providers>
        </ClerkProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
