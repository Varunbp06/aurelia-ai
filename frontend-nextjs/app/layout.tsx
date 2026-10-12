import type { Metadata, Viewport } from 'next';
import '../src/index.css';
import { AppProviders } from '../src/components/AppProviders';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://aurelia.ai',
  ),
  title: {
    default: 'Aurelia AI — AI Agent Management Platform',
    template: '%s · Aurelia AI',
  },
  description:
    'Aurelia AI is an AI agent management platform to create, deploy, and monitor support agents — websites, sales outreach, and custom AI clones with a live chat center and knowledge base.',
  keywords: [
    'Aurelia AI',
    'AI agents',
    'AI chatbot',
    'support agent',
    'knowledge base',
    'live chat',
  ],
  applicationName: 'Aurelia AI',
  icons: {
    icon: '/favicon.svg',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: 'Aurelia AI',
    title: 'Aurelia AI — AI Agent Management Platform',
    description:
      'Create, deploy, and monitor AI support agents with a live chat center and knowledge base.',
    url: '/',
  },
  twitter: {
    card: 'summary',
    title: 'Aurelia AI — AI Agent Management Platform',
    description:
      'Create, deploy, and monitor AI support agents with a live chat center and knowledge base.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1b1b25',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
