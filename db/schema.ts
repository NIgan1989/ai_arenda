import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(), name: text('name').notNull(), contact: text('contact').notNull().default(''),
  city: text('city').notNull().default('Павлодар'), roles: text('roles').notNull().default('["guest"]'),
  districts: text('districts').notNull().default(''), experience: text('experience').notNull().default(''),
  availability: text('availability').notNull().default(''), createdAt: integer('created_at').notNull(),
});
export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), demoOwner: text('demo_owner'),
  title: text('title').notNull(), city: text('city').notNull(), district: text('district').notNull(),
  address: text('address').notNull(), description: text('description').notNull(),
  price: integer('price').notNull(), rooms: integer('rooms').notNull(), capacity: integer('capacity').notNull(),
  cleaningMinutes: integer('cleaning_minutes').notNull().default(90),
  published: integer('published').notNull().default(1), createdAt: integer('created_at').notNull(),
});
export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(), propertyId: text('property_id').notNull().references(() => properties.id),
  guestId: text('guest_id').notNull(), start: integer('start').notNull(), end: integer('end').notNull(),
  occupiedUntil: integer('occupied_until').notNull(), guests: integer('guests').notNull(),
  amount: integer('amount').notNull(), status: text('status').notNull().default('requested'),
  expiresAt: integer('expires_at').notNull(), paymentStatus: text('payment_status').notNull().default('unpaid'),
  requestKey: text('request_key').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('booking_request_key').on(t.guestId, t.requestKey)]);
export const cleaningJobs = sqliteTable('cleaning_jobs', {
  id: text('id').primaryKey(), propertyId: text('property_id').notNull().references(() => properties.id),
  ownerId: text('owner_id').notNull(), bookingId: text('booking_id'),
  start: integer('start').notNull(), end: integer('end').notNull(), fee: integer('fee').notNull(),
  description: text('description').notNull(), status: text('status').notNull().default('open'),
  assignedTo: text('assigned_to'), checklist: text('checklist').notNull().default('[]'),
  report: text('report').notNull().default(''), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('job_for_booking').on(t.bookingId)]);
export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(), jobId: text('job_id').notNull().references(() => cleaningJobs.id),
  userId: text('user_id').notNull(), status: text('status').notNull().default('pending'), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('job_applicant').on(t.jobId, t.userId)]);
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), scope: text('scope').notNull(),
  sender: text('sender').notNull(), body: text('body').notNull(), createdAt: integer('created_at').notNull(),
});
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), body: text('body').notNull(),
  dedupe: text('dedupe').notNull(), read: integer('read').notNull().default(0), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('notification_dedupe').on(t.dedupe)]);
export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(), actorId: text('actor_id').notNull(), entityId: text('entity_id').notNull(),
  action: text('action').notNull(), createdAt: integer('created_at').notNull(),
});
export const propertyPolicies = sqliteTable('property_policies', {
  propertyId: text('property_id').primaryKey().references(() => properties.id),
  hourlyPrice: integer('hourly_price').notNull().default(0), minHours: integer('min_hours').notNull().default(2),
  nightlyPrice: integer('nightly_price').notNull().default(0),
  checkinMinutes: integer('checkin_minutes').notNull().default(840), checkoutMinutes: integer('checkout_minutes').notNull().default(720),
  deposit: integer('deposit').notNull().default(0), houseRules: text('house_rules').notNull().default(''),
  autoConfirm: integer('auto_confirm').notNull().default(0), cleaningFee: integer('cleaning_fee').notNull().default(0),
  cleaningBudget: integer('cleaning_budget').notNull().default(0), version: integer('version').notNull().default(1),
  revision: text('revision').notNull(), updatedAt: integer('updated_at').notNull(),
});
export const propertyOperations = sqliteTable('property_operations', {
  propertyId: text('property_id').primaryKey().references(() => properties.id), readiness: text('readiness').notNull().default('inspection'),
  activeBookingId: text('active_booking_id').references(() => bookings.id), version: integer('version').notNull().default(1),
  note: text('note').notNull().default(''), updatedAt: integer('updated_at').notNull(),
});
export const bookingTerms = sqliteTable('booking_terms', {
  bookingId: text('booking_id').primaryKey().references(() => bookings.id), billingMode: text('billing_mode').notNull(),
  rate: integer('rate').notNull(), units: integer('units').notNull(), amount: integer('amount').notNull(),
  deposit: integer('deposit').notNull().default(0), depositStatus: text('deposit_status').notNull().default('not_required'),
  houseRules: text('house_rules').notNull().default(''), policyVersion: integer('policy_version').notNull().default(0),
  actualCheckin: integer('actual_checkin'), actualCheckout: integer('actual_checkout'), checkoutReportedAt: integer('checkout_reported_at'),
});
export const assistantPreferences = sqliteTable('assistant_preferences', {
  userId: text('user_id').notNull(), role: text('role').notNull(), settings: text('settings').notNull(),
  version: integer('version').notNull().default(1), updatedAt: integer('updated_at').notNull(),
}, t => [uniqueIndex('assistant_preferences_user_role').on(t.userId,t.role)]);
