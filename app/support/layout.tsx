import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Почему я собираю поддержку — World Clock Widget',
  description: 'Личная история автора World Clock Widget о госпитализации, лечении и поддержке проекта.',
};

export default function SupportLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
