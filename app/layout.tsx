import '../styles/globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Acer Challenge',
  description: 'Daily numbers challenge with 5 timed rounds and leaderboards.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="siteLogo" href="/" aria-label="Acer Challenge home">
          <img src="/images/acer-can-winner-logo.png" alt="Acer Challenge" />
        </a>
        {children}
      </body>
    </html>
  );
}
