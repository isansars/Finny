// Finny's tables. Money is always integer sen (rupiah × 100) in bigint columns, never a float.
import { pgTable, text, timestamp, integer, primaryKey, bigint, boolean, date, index, check, uuid, uniqueIndex } from "drizzle-orm/pg-core";
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

// ---- FINNY-46 (🦦 Mira): one row per workbook import, so an import can be undone exactly.
export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { mode: "date" }),
  txns: integer("txns").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  accounts: integer("accounts").notNull().default(0),
  categories: integer("categories").notNull().default(0),
  // FINNY-69: a bank statement batch knows its account, period and file, so the same statement is never saved twice.
  kind: text("kind", { enum: ["workbook", "statement"] }).notNull().default("workbook"),
  accountId: uuid("account_id"),
  bank: text("bank"),
  periodFrom: date("period_from", { mode: "string" }),
  periodTo: date("period_to", { mode: "string" }),
  fileHash: text("file_hash"),
}, (t) => [index("import_batches_user").on(t.userId), uniqueIndex("import_batches_file").on(t.userId, t.fileHash).where(sql`${t.fileHash} is not null`)]);

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
  importBatchId: uuid("import_batch_id"), // FINNY-46: created by this import (undo removes it if nothing else uses it)
  // FINNY-85: a card's or loan's terms. Interest in basis points (1,75% = 175) per month or per year; the minimum is a
  // fixed amount, or a % of the balance with a floor.
  interestBp: integer("interest_bp"),
  interestPer: text("interest_per", { enum: ["month", "year"] }),
  minFixedSen: bigint("min_fixed_sen", { mode: "number" }),
  minPctBp: integer("min_pct_bp"),
  minFloorSen: bigint("min_floor_sen", { mode: "number" }),
  dueDay: integer("due_day"),
  purpose: text("purpose", { enum: ["productive", "consumptive"] }),
  // FINNY-93: what an investment account holds; fixed income also has a yearly rate and a maturity date.
  holdingKind: text("holding_kind", { enum: ["stock", "fund", "crypto", "gold", "bond", "deposit", "p2p", "other"] }),
  rateBp: integer("rate_bp"),
  maturityOn: date("maturity_on", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("money_accounts_user").on(t.userId), check("money_accounts_terms", sql`(${t.interestBp} is null or ${t.interestBp} between 0 and 100000)
    and (${t.minFixedSen} is null or ${t.minFixedSen} >= 0) and (${t.minPctBp} is null or ${t.minPctBp} between 0 and 10000)
    and (${t.minFloorSen} is null or ${t.minFloorSen} >= 0) and (${t.dueDay} is null or ${t.dueDay} between 1 and 31)
    and (${t.statementDay} is null or ${t.statementDay} between 1 and 31)`), check("money_accounts_holding", sql`${t.rateBp} is null or ${t.rateBp} between 0 and 100000`)]);

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
  importBatchId: uuid("import_batch_id"), // FINNY-46
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
  index("transactions_import_batch").on(t.importBatchId),
  check("transactions_amount_positive", sql`${t.amountSen} > 0`),
  // A transfer moves between two different accounts and has no category; spend and income have a category and no second account.
  check("transactions_shape", sql`(${t.kind} = 'transfer' and ${t.toAccountId} is not null and ${t.toAccountId} <> ${t.accountId} and ${t.categoryId} is null)
    or (${t.kind} <> 'transfer' and ${t.toAccountId} is null and ${t.categoryId} is not null)`),
]);

// FINNY-60: a budget per category per month ("2026-11"), or every month ("*", overridden by a month's own row; an
// override of 0 removes the budget for that month only). Expected income per month the same way.
export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("budgets_one").on(t.userId, t.categoryId, t.month), check("budgets_shape", sql`${t.amountSen} >= 0 and (${t.month} = '*' or ${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')`)]);

export const incomePlans = pgTable("income_plans", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  amountSen: bigint("amount_sen", { mode: "number" }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.month] }), check("income_plans_shape", sql`${t.amountSen} >= 0 and (${t.month} = '*' or ${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')`)]);

// FINNY-85: the owner's payoff plan: the method and the extra paid each month on top of the minimums.
export const debtPlans = pgTable("debt_plans", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  method: text("method", { enum: ["minimums", "snowball", "avalanche"] }).notNull().default("snowball"),
  extraSen: bigint("extra_sen", { mode: "number" }).notNull().default(0),
}, (t) => [check("debt_plans_extra", sql`${t.extraSen} >= 0`)]);

// FINNY-93: market values typed by the owner, one per investment account and day.
export const accountValues = pgTable("account_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => moneyAccounts.id, { onDelete: "cascade" }),
  on: date("on", { mode: "string" }).notNull(),
  valueSen: bigint("value_sen", { mode: "number" }).notNull(),
}, (t) => [uniqueIndex("account_values_one").on(t.accountId, t.on), check("account_values_shape", sql`${t.valueSen} >= 0`)]);

// FINNY-93: property, vehicles, equipment, personal things and business stakes: no money flows, a value over time.
export const THING_KINDS = ["property", "vehicle", "equipment", "personal", "business", "other"] as const;
export const things = pgTable("things", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: THING_KINDS }).notNull(),
  boughtOn: date("bought_on", { mode: "string" }).notNull(),
  costSen: bigint("cost_sen", { mode: "number" }).notNull(),
  yearlyBp: integer("yearly_bp").notNull().default(0), // + gains, − loses, per year
  shareBp: integer("share_bp").notNull().default(10000), // a business stake: the share owned
  valueSen: bigint("value_sen", { mode: "number" }), // set by hand on value_on; the yearly change carries on from there
  valueOn: date("value_on", { mode: "string" }),
  soldOn: date("sold_on", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => [index("things_user").on(t.userId), check("things_shape", sql`${t.costSen} >= 0 and ${t.yearlyBp} between -10000 and 10000 and ${t.shareBp} between 1 and 10000
  and (${t.valueSen} is null or ${t.valueSen} >= 0) and ((${t.valueSen} is null) = (${t.valueOn} is null))`)]);

// FINNY-101: the emergency fund: the inputs behind its target, and the accounts that hold it (all of a balance, or a part).
export const emergencyFunds = pgTable("emergency_funds", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  stability: text("stability", { enum: ["stable", "fair", "uncertain"] }).notNull().default("fair"),
  dependents: integer("dependents").notNull().default(0),
  spendingSen: bigint("spending_sen", { mode: "number" }), // null = Finny's 3-month average
  target: text("target", { enum: ["low", "high", "own"] }).notNull().default("low"),
  ownTargetSen: bigint("own_target_sen", { mode: "number" }),
  monthlySen: bigint("monthly_sen", { mode: "number" }).notNull().default(0),
}, (t) => [check("emergency_funds_shape", sql`${t.dependents} between 0 and 3 and (${t.spendingSen} is null or ${t.spendingSen} >= 0)
  and (${t.ownTargetSen} is null or ${t.ownTargetSen} >= 0) and ${t.monthlySen} >= 0 and (${t.target} <> 'own' or ${t.ownTargetSen} is not null)`)]);

export const emergencySources = pgTable("emergency_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => moneyAccounts.id, { onDelete: "cascade" }),
  partSen: bigint("part_sen", { mode: "number" }), // null = all of it
}, (t) => [uniqueIndex("emergency_sources_one").on(t.userId, t.accountId), check("emergency_sources_part", sql`${t.partSen} is null or ${t.partSen} >= 0`)]);
