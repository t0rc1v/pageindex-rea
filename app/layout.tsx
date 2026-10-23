import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";

import { AppProviders } from "@/components/providers";
import { ConfirmProvider } from "@/components/ui/confirm";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

/**
 * Without an explicit viewport export Next emits no `<meta name="viewport">`,
 * so mobile browsers fall back to a ~980 px layout viewport and every
 * breakpoint above `sm` fires on a phone.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f5f1",
};

export const metadata: Metadata = {
  title: "PageIndex Reader",
  description:
    "A co-reader for long documents, built on the PageIndex Cloud API: tree-navigable PDFs and answers with page- and block-level citations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
        <AppProviders>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AppProviders>
      </body>
    </html>
  );
}
