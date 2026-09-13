export const IDEAS = [
  {
    id: 'mobile-official',
    status: 'funding',
    goalCents: 15000,
    title: { ru: 'Приложения для iOS и Android', en: 'iOS and Android apps' },
    description: {
      ru: 'Синхронизация будильников с телефоном.',
      en: 'Sync alarms with your phone.',
    },
    cost: { ru: '$25 Google Play + $99 в год Apple', en: '$25 Google Play + $99/year Apple' },
  },
  {
    id: 'voice-control', status: 'idea', goalCents: 0,
    title: { ru: 'Таймеры голосом', en: 'Voice-created timers' },
    description: { ru: 'Сказать обычной фразой, когда и для чего нужен таймер, без открытия редактора.', en: 'Say when and why you need a timer without opening the editor.' },
    cost: { ru: 'Сначала проверяем интерес', en: 'Interest check first' },
  },
  {
    id: 'shared-alarms', status: 'idea', goalCents: 0,
    title: { ru: 'Общие напоминания', en: 'Shared reminders' },
    description: { ru: 'Отправлять будильник близкому человеку или использовать одно расписание на нескольких устройствах.', en: 'Send an alarm to someone close or use one schedule across several devices.' },
    cost: { ru: 'Сначала проверяем интерес', en: 'Interest check first' },
  },
] as const;

export const IDEA_IDS = new Set<string>(IDEAS.map((idea) => idea.id));
