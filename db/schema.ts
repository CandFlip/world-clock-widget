import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  picture: text('picture').notNull(),
  firstSeen: text('first_seen').notNull(),
  lastSeen: text('last_seen').notNull(),
}, (table) => [index('idx_users_last_seen').on(table.lastSeen)]);

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_sessions_user_id').on(table.userId),
  index('idx_sessions_expires_at').on(table.expiresAt),
]);

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
