export const strings = {
  ru: {
    navRoadmap: 'Планы', navIdeas: 'Предложить идею', navSupport: 'Поддержать', signin: 'Войти', admin: 'Админка',
    headline: 'Время в разных часовых поясах и таймер поверх любых окон.', intro: 'Скачайте приложение или выберите, что добавить следующим.',
    download: 'Скачать для Windows', downloadMac: 'Скачать для Mac', source: 'Официальная версия на GitHub', downloadNote: '(Жопу ставлю: вирусов нет, систему приложение не положит. Лицензии пока не покупались — сейчас на них просто нет денег.)', roadmap: 'Что дальше?', roadmapCopy: 'Выберите одну функцию. Голос можно изменить.',
    vote: 'Голосовать', choice: 'Ваш выбор', ideaTitle: 'Предложить функцию', ideaCopy: 'Коротко опишите, что нужно добавить.', suggest: 'Предложить идею',
    community: 'Идеи сообщества', mobileGoal: 'Лицензии iOS и Android', supportTitle: 'Поддержка проекта и автора', support: 'Поддержать', whySupport: 'Почему я собираю?',
    loginTitle: 'Войти', loginCopy: 'Вход нужен для голосования и предложений.', problem: 'Какую проблему это решит?', outcome: 'Как должен выглядеть результат?',
    send: 'Отправить', thanks: 'Спасибо. Запись отправлена.', methods: 'Поддержка автора', noMethods: 'Способы поддержки пока не подключены.', paymentNote: 'Выберите удобный способ.', copy: 'Копировать', copied: 'Скопировано',
  },
  en: {
    navRoadmap: 'Roadmap', navIdeas: 'Suggest an idea', navSupport: 'Support', signin: 'Sign in', admin: 'Admin',
    headline: 'Time across time zones and a timer above any window.', intro: 'Download the app or vote for what should be added next.',
    download: 'Download for Windows', downloadMac: 'Download for Mac', source: 'Official release on GitHub', downloadNote: '(I bet my ass: there are no viruses and the app won’t wreck your system. The licenses haven’t been purchased yet — there simply isn’t money for them right now.)', roadmap: 'What’s next?', roadmapCopy: 'Choose one feature. You can change your vote.',
    vote: 'Vote', choice: 'Your choice', ideaTitle: 'Suggest a feature', ideaCopy: 'Briefly describe what should be added.', suggest: 'Suggest an idea',
    community: 'Community ideas', mobileGoal: 'iOS and Android licenses', supportTitle: 'Support the project and its author', support: 'Support', whySupport: 'Why am I raising funds?',
    loginTitle: 'Sign in', loginCopy: 'Sign in to vote or suggest an idea.', problem: 'What problem would this solve?', outcome: 'What should the result look like?',
    send: 'Send', thanks: 'Thank you. Your message was sent.', methods: 'Support the author', noMethods: 'Support options have not been connected yet.', paymentNote: 'Choose a payment method.', copy: 'Copy', copied: 'Copied',
  },
};

export type SiteLocale = 'ru' | 'en';
export function siteCopy(locale: SiteLocale, override?: string): typeof strings.ru {
  if (!override) return strings[locale];
  try {
    const parsed: unknown = JSON.parse(override);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return strings[locale];
    const valid = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key in strings[locale] && typeof value === 'string'));
    return { ...strings[locale], ...valid };
  } catch { return strings[locale]; }
}
