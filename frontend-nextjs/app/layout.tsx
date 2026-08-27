import type { Metadata } from 'next';
import '../src/index.css';
import { AppProviders } from '../src/components/AppProviders';

export const metadata: Metadata = {
  title: 'Aurelia AI',
  description: 'Aurelia AI admin dashboard',
  icons: {
    icon: '/favicon.svg',
  },
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
