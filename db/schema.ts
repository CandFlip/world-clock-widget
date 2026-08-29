import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const votes = sqliteTable('votes', {
  visitorId: text('visitor_id').primaryKey(),
  optionId: text('option_id').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const timerFeedback = sqliteTable('timer_feedback', {
  visitorId: text('visitor_id').primaryKey(),
  context: text('context').notNull(),
  placement: text('placement').notNull(),
  alertStyle: text('alert_style').notNull(),
  typicalDuration: text('typical_duration').notNull(),
  notes: text('notes').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
