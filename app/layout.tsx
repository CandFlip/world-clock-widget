import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ variable: '--font-body', subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://world-clock-next.decent-rat-2368.chatgpt.site'),
  title: 'Что дальше? — World Clock Widget',
  description: 'Бесплатный World Clock Widget: скачать приложение, проголосовать за следующие функции или поддержать автора.',
  openGraph: {
    title: 'Что дальше? — World Clock Widget',
    description: 'Приложение бесплатно. Выберите, что стоит сделать следующим, или поддержите автора.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'What should I do next? World Clock Widget roadmap' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Что дальше? — World Clock Widget',
    description: 'Приложение бесплатно. Выберите следующую функцию или поддержите автора.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={manrope.variable}>{children}</body></html>;
}
