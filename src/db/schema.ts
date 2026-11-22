// Finny's tables. Money is always integer sen (rupiah × 100) in bigint columns, never a float.
import { pgTable, text, timestamp, integer, primaryKey, bigint, boolean, date, index, check, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---- Auth.js (Drizzle adapter): who may be signed in.
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable("auth_accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

// ---- Finny (FINNY-26, 🦦 Mira): accounts, categories, entities, transactions. Every row belongs to one user.

export const ACCOUNT_TYPES = ["cash", "bank", "ewallet", "card", "loan", "investment"] as const;
export const CATEGORY_KINDS = ["income", "expense", "saving", "investment"] as const;
export const TXN_KINDS = ["spend", "income", "transfer"] as const;

export const moneyAccounts = pgTable("money_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
  emoji: text("emoji"),
  openingSen: bigint("opening_sen", { mode: "number" }).notNull().default(0),
  openingOn: date("opening_on", { mode: "string" }).notNull(),
  limitSen: bigint("limit_sen", { mode: "number" }),
  statementDay: integer("statement_day"),
  archived: boolean("archived").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("money_accounts_user").on(t.userId)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
  name: text("name").notNull(),
  emoji: text("emoji"),
  icon: text("icon"), // FINNY-38: a Lucide icon key; null = guessed from the name (category-look.ts)
  color: text("color"), // FINNY-38: a palette key; null = guessed
  parentId: uuid("parent_id"),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
}, (t) => [index("categories_user").on(t.userId)]);

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
}, (t) => [index("entities_user").on(t.userId)]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  on: date("on", { mode: "string" }).notNull(),
  kind: text("kind", { enum: TXN_KINDS }).notNull(),
  amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
  accountId: uuid("account_id").notNull().references(() => moneyAccounts.id, { onDelete: "restrict" }),
  toAccountId: uuid("to_account_id").references(() => moneyAccounts.id, { onDelete: "restrict" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
  entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
  description: text("description").notNull().default(""),
  note: text("note"),
  importBatchId: uuid("import_batch_id"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [
  index("transactions_user_on").on(t.userId, t.on),
  index("transactions_user_account_on").on(t.userId, t.accountId, t.on),
  check("transactions_amount_positive", sql`${t.amountSen} > 0`),
  // A transfer moves between two different accounts and has no category; spend and income have a category and no second account.
  check("transactions_shape", sql`(${t.kind} = 'transfer' and ${t.toAccountId} is not null and ${t.toAccountId} <> ${t.accountId} and ${t.categoryId} is null)
    or (${t.kind} <> 'transfer' and ${t.toAccountId} is null and ${t.categoryId} is not null)`),
]);
