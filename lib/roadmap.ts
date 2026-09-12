export const IDEAS = [
  {
    id: 'mobile-official',
    status: 'funding',
    goalCents: 15000,
    title: { ru: 'Официальные приложения для телефона', en: 'Official phone apps' },
    description: {
      ru: 'Сейчас Android-версия — очень ранний эксперимент. Она устанавливается вручную из APK, поэтому Android может предупреждать о неизвестном или ненадёжном источнике. После завершения сбора будут оплачены аккаунты Google Play и Apple Developer, чтобы Android и iPhone устанавливались официально. Будильник с Windows будет звонить на телефоне, где его можно завершить или отложить на 5 минут.',
      en: 'The current Android build is a very early experiment installed manually from an APK, so Android may warn about an unknown or untrusted source. Once the goal is funded, Google Play and Apple Developer accounts can be paid for official Android and iPhone distribution. Windows alarms will ring on the phone and can be dismissed or snoozed by 5 minutes.',
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
