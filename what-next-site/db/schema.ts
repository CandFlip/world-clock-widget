import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const suggestions = sqliteTable('suggestions', {
  id: text('id').primaryKey(), visitorId: text('visitor_id').notNull(), title: text('title').notNull(),
  problem: text('problem').notNull(), outcome: text('outcome').notNull(), status: text('status').notNull(),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_suggestions_status_created').on(table.status, table.createdAt)]);

export const contributions = sqliteTable('contributions', {
  id: text('id').primaryKey(), visitorId: text('visitor_id'), targetId: text('target_id').notNull(),
  amountCents: text('amount_cents').notNull(), currency: text('currency').notNull(), reference: text('reference').notNull(),
  status: text('status').notNull(), provider: text('provider').notNull().default('legacy-manual'),
  providerEventId: text('provider_event_id'), verifiedAt: text('verified_at'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_contributions_target_status').on(table.targetId, table.status),
  uniqueIndex('idx_contributions_provider_event').on(table.provider, table.providerEventId),
]);

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(), value: text('value').notNull(), updatedAt: text('updated_at').notNull(),
});

export const supportMethods = sqliteTable('support_methods', {
  id: text('id').primaryKey(), label: text('label').notNull(), url: text('url').notNull(), instructions: text('instructions').notNull(),
  active: text('active').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
