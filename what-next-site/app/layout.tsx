import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  variable: '--font-body',
  subsets: ['latin', 'cyrillic'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    'https://world-clock-next.decent-rat-2368.chatgpt.site',
  ),

  title: 'World Clock — время в нескольких городах без пересчёта',

  description:
    'Компактный World Clock для Windows: двигайте одну шкалу и сразу смотрите соответствующее время во всех нужных городах.',

  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },

  openGraph: {
    title: 'World Clock — не считайте часовые пояса в голове',
    description:
      'Компактный Windows-виджет. Выберите момент на одной шкале и сразу увидьте время во всех городах.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'World Clock Widget',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'World Clock — не считайте часовые пояса в голове',
    description:
      'Компактный Windows-виджет для быстрого сравнения времени в нескольких городах.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        <link
          rel="icon"
          href="/favicon.svg"
          type="image/svg+xml"
        />
        <link
          rel="shortcut icon"
          href="/favicon.svg"
        />
      </head>

      <body className={manrope.variable}>
        {children}
      </body>
    </html>
  );
}
