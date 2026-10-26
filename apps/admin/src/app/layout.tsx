import type { Metadata } from 'next';
import type * as React from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Family Planer Admin', template: '%s - FP Admin' },
  robots: { index: false, follow: false },
};

/** Resolves the theme before first paint to avoid a light/dark flash. */
const themeScript = `(function(){try{var t=localStorage.getItem('fp-admin-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
