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
  openGraph: {
    title: 'simplestclaw',
    description: 'The simplest way to set up and use OpenClaw',
    type: 'website',
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
