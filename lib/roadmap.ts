export const IDEAS = [
  {
    id: 'mobile-official',
    status: 'funding',
    goalCents: 12400,
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

export type Idea = { id: string; status: string; goalCents: number; title: { ru: string; en: string }; description: { ru: string; en: string }; cost: { ru: string; en: string } };

export function parseIdeas(value?: string): Idea[] {
  if (!value) return IDEAS.map((idea) => ({ ...idea, title: { ...idea.title }, description: { ...idea.description }, cost: { ...idea.cost } }));
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return parseIdeas();
    return parsed.filter((item): item is Idea => typeof item === 'object' && item !== null &&
      typeof item.id === 'string' && typeof item.title?.ru === 'string' && typeof item.title?.en === 'string' &&
      typeof item.description?.ru === 'string' && typeof item.description?.en === 'string' &&
      typeof item.cost?.ru === 'string' && typeof item.cost?.en === 'string' && typeof item.status === 'string' &&
      typeof item.goalCents === 'number');
  } catch { return parseIdeas(); }
}


export type Suggestion = { id: string; title: string; problem: string; outcome: string; status?: string };
export function publicIdeas(raw: string | undefined, suggestions: Suggestion[]): Idea[] {
  return [...parseIdeas(raw).filter((idea) => idea.status !== 'hidden').map((idea) => ({ ...idea, title: { ru: idea.title.ru || idea.title.en, en: idea.title.en || idea.title.ru }, description: { ru: idea.description.ru || idea.description.en, en: idea.description.en || idea.description.ru } })), ...suggestions.map((item) => ({
    id: `suggestion-${item.id}`, status: 'community', goalCents: 0,
    title: { ru: item.title, en: item.title },
    description: { ru: [item.problem, item.outcome].filter(Boolean).join('\n\n'), en: [item.problem, item.outcome].filter(Boolean).join('\n\n') },
    cost: { ru: '', en: '' },
  }))];
}
