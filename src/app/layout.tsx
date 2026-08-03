import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  title: {
    default: `${site.name} | ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} | ${site.tagline}`,
    description: site.description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} | ${site.tagline}`,
    description: site.description,
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The theme script writes data-theme before React hydrates, so the
      // server-rendered value and the client's first pass legitimately
      // differ. Without this, React warns and can revert the attribute.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applies the theme before first paint. This has to be a blocking
          inline script rather than an effect: an effect runs after
          hydration, which is late enough that anyone who chose dark gets a
          full white flash on every navigation. Falls back to the operating
          system preference when no choice has been stored, and is wrapped
          in try/catch because private browsing can refuse localStorage
          outright — a theme that throws must never take the page with it.
        */}
        <script
          dangerouslySetInnerHTML={{
            // Light is the product's default, not the operating system's
            // preference. Following prefers-color-scheme meant most
            // first-time visitors — who skew dark at the OS level — met a
            // dark marketing site, which is not the impression this brand
            // is built to make. Dark is a choice the toggle stores, and a
            // stored choice always wins from then on.
            __html: `(function(){try{var t=localStorage.getItem('ascent-theme');if(t!=='dark'&&t!=='light'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
