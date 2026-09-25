import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/clerkConfig";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "Ocean Water Quality",
  description: "Daily ocean water quality forecast.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const page = (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-gray-900">
        {children}
        <Analytics />
      </body>
    </html>
  );

  // Wrapped only when Clerk is configured. ClerkProvider without keys throws,
  // which would take down every board over a feature no board requires — the
  // same way the unconfigured PostHog instrumentation took down the dev server
  // earlier. Nothing here needs an account, so nothing here should break
  // without one.
  return isClerkConfigured() ? <ClerkProvider>{page}</ClerkProvider> : page;
}
