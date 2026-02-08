import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'simplestclaw - The Simplest Way to Use OpenClaw',
  description:
    'One-click setup for OpenClaw, the open-source AI coding assistant. No Telegram required. Run locally or deploy to the cloud.',
  metadataBase: new URL('https://simplestclaw.com'),
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'simplestclaw',
    description: 'The simplest way to set up and use OpenClaw',
    type: 'website',
    siteName: 'SimplestClaw',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SimplestClaw - The simplest way to use OpenClaw',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'simplestclaw',
    description: 'The simplest way to set up and use OpenClaw',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-zinc-950 text-zinc-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
