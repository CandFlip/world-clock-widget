import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ variable: '--font-body', subsets: ['latin'] });
const spaceGrotesk = Space_Grotesk({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://world-clock-next.decent-rat-2368.chatgpt.site'),
  title: 'What should I do next? — World Clock Widget',
  description: 'Vote on what should be built next for World Clock Widget.',
  openGraph: {
    title: 'What should I do next?',
    description: 'Vote on the next World Clock Widget feature.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'What should I do next? World Clock Widget roadmap' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'What should I do next?',
    description: 'Vote on the next World Clock Widget feature.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${manrope.variable} ${spaceGrotesk.variable}`}>{children}</body></html>;
}
