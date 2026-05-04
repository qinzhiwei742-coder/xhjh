import { pgTable, serial, timestamp, index, uuid, varchar, text, boolean, pgPolicy, unique, integer, foreignKey, numeric, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Helper function for generating UUID
const genUuid = () => sql`gen_random_uuid()`;



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const contacts = pgTable("contacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	position: varchar({ length: 100 }),
	phone: varchar({ length: 50 }),
	wechat: varchar({ length: 100 }),
	remark: text(),
	isPrimary: boolean("is_primary").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	wecomId: varchar("wecom_id", { length: 100 }),
}, (table) => [
	index("idx_contacts_is_primary").using("btree", table.isPrimary.asc().nullsLast().op("bool_ops")),
	index("idx_contacts_store_id").using("btree", table.storeId.asc().nullsLast().op("uuid_ops")),
]);

export const operationLogs = pgTable("operation_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id", { length: 100 }).notNull(),
	userName: varchar("user_name", { length: 100 }),
	operationType: varchar("operation_type", { length: 50 }).notNull(),
	resourceType: varchar("resource_type", { length: 50 }).notNull(),
	resourceId: varchar("resource_id", { length: 100 }),
	resourceName: varchar("resource_name", { length: 255 }),
	detail: text(),
	storeSystem: varchar("store_system", { length: 50 }).default('hecha'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_operation_logs_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_operation_logs_operation_type").using("btree", table.operationType.asc().nullsLast().op("text_ops")),
	index("idx_operation_logs_resource_type").using("btree", table.resourceType.asc().nullsLast().op("text_ops")),
	index("idx_operation_logs_store_system").using("btree", table.storeSystem.asc().nullsLast().op("text_ops")),
	index("idx_operation_logs_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	pgPolicy("Allow anon access for operation_logs", { as: "permissive", for: "all", to: ["anon"], using: sql`true`, withCheck: sql`true`  }),
]);

export const tagPresets = pgTable("tag_presets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tagName: varchar("tag_name", { length: 50 }).notNull(),
	tagColor: varchar("tag_color", { length: 20 }).notNull(),
	sortOrder: integer("sort_order").default(0),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("tag_presets_tag_name_key").on(table.tagName),
	pgPolicy("Allow anon access for tag_presets", { as: "permissive", for: "all", to: ["anon"], using: sql`true`, withCheck: sql`true`  }),
]);

export const businessStaff = pgTable("business_staff", {
	id: varchar({ length: 20 }).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	password: varchar({ length: 100 }).default('123456').notNull(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const followRecords = pgTable("follow_records", {
	id: varchar({ length: 36 }).default(genUuid()).primaryKey().notNull(),
	storeId: varchar("store_id", { length: 36 }).notNull(),
	followTime: timestamp("follow_time", { withTimezone: true, mode: 'string' }).notNull(),
	remark: text(),
	aiAnalysis: text("ai_analysis"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	nextFollowTime: timestamp("next_follow_time", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("follow_records_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("follow_records_follow_time_idx").using("btree", table.followTime.asc().nullsLast().op("timestamptz_ops")),
	index("follow_records_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [stores.id],
			name: "follow_records_store_id_stores_id_fk"
		}).onDelete("cascade"),
	pgPolicy("follow_records_允许公开写入", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true`  }),
	pgPolicy("follow_records_允许公开删除", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("follow_records_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("follow_records_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const robotConfigs = pgTable("robot_configs", {
	id: varchar({ length: 36 }).default(genUuid()).primaryKey().notNull(),
	storeId: varchar("store_id", { length: 36 }).notNull(),
	webhookUrl: text("webhook_url").notNull(),
	robotName: varchar("robot_name", { length: 255 }),
	description: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("robot_configs_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("robot_configs_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [stores.id],
			name: "robot_configs_store_id_stores_id_fk"
		}).onDelete("cascade"),
	pgPolicy("robot_configs_允许公开写入", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true`  }),
	pgPolicy("robot_configs_允许公开删除", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("robot_configs_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("robot_configs_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const followImages = pgTable("follow_images", {
	id: varchar({ length: 36 }).default(genUuid()).primaryKey().notNull(),
	followRecordId: varchar("follow_record_id", { length: 36 }).notNull(),
	imageKey: varchar("image_key", { length: 500 }).notNull(),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("follow_images_follow_record_id_idx").using("btree", table.followRecordId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.followRecordId],
			foreignColumns: [followRecords.id],
			name: "follow_images_follow_record_id_follow_records_id_fk"
		}).onDelete("cascade"),
	pgPolicy("follow_images_允许公开写入", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true`  }),
	pgPolicy("follow_images_允许公开删除", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("follow_images_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("follow_images_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);

export const storeTags = pgTable("store_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: varchar("store_id", { length: 36 }).notNull(),
	tagName: varchar("tag_name", { length: 50 }).notNull(),
	tagColor: varchar("tag_color", { length: 20 }).default('#165dff'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_store_tags_store_id").using("btree", table.storeId.asc().nullsLast().op("text_ops")),
	index("idx_store_tags_tag_name").using("btree", table.tagName.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [stores.id],
			name: "store_tags_store_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Allow anon access for store_tags", { as: "permissive", for: "all", to: ["anon"], using: sql`true`, withCheck: sql`true`  }),
]);

export const storeImages = pgTable("store_images", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeId: uuid("store_id").notNull(),
	imageKey: varchar("image_key", { length: 500 }).notNull(),
	imageUrl: text("image_url").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	pgPolicy("Allow delete for all users", { as: "permissive", for: "delete", to: ["public"], using: sql`true` }),
	pgPolicy("Allow insert for authenticated users", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Allow select for all users", { as: "permissive", for: "select", to: ["public"] }),
]);

export const dataFileHistory = pgTable("data_file_history", {
	id: varchar({ length: 36 }).default(genUuid()).primaryKey().notNull(),
	fileType: varchar("file_type", { length: 20 }).notNull(),
	storeSystem: varchar("store_system", { length: 20 }).notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	fileKey: varchar("file_key", { length: 500 }).notNull(),
	fileSize: integer("file_size"),
	minTime: varchar("min_time", { length: 50 }),
	maxTime: varchar("max_time", { length: 50 }),
	isActive: boolean("is_active").default(true).notNull(),
	uploadedBy: varchar("uploaded_by", { length: 255 }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("data_file_history_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("data_file_history_file_type_idx").using("btree", table.fileType.asc().nullsLast().op("text_ops")),
	index("data_file_history_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("data_file_history_store_system_idx").using("btree", table.storeSystem.asc().nullsLast().op("text_ops")),
]);

export const adExpenseRecords = pgTable("ad_expense_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeSystem: varchar("store_system", { length: 20 }).notNull(),
	accountIndex: integer("account_index").notNull(),
	storeId: varchar("store_id", { length: 100 }),
	storeName: varchar("store_name", { length: 255 }),
	spend: numeric({ precision: 12, scale:  2 }).default('0'),
	orders: integer().default(0),
	recordDate: date("record_date"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_ad_expense_account").using("btree", table.storeSystem.asc().nullsLast().op("int4_ops"), table.accountIndex.asc().nullsLast().op("text_ops")),
	index("idx_ad_expense_store_id").using("btree", table.storeSystem.asc().nullsLast().op("int4_ops"), table.accountIndex.asc().nullsLast().op("int4_ops"), table.storeId.asc().nullsLast().op("text_ops")),
	index("idx_ad_expense_store_system").using("btree", table.storeSystem.asc().nullsLast().op("text_ops")),
]);

// ========== 订单、核销、退款数据表 ==========

// 数据上传历史记录表
export const dataUploadHistory = pgTable("data_upload_history", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeSystem: varchar("store_system", { length: 20 }).notNull(),
	fileType: varchar("file_type", { length: 20 }).notNull(), // order/verify/refund
	fileName: varchar("file_name", { length: 255 }),
	recordCount: integer("record_count").default(0), // 本次上传的记录数
	minTime: varchar("min_time", { length: 50 }), // 数据时间范围
	maxTime: varchar("max_time", { length: 50 }),
	uploadedBy: varchar("uploaded_by", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_data_upload_history_store_system").using("btree", table.storeSystem.asc().nullsLast().op("text_ops")),
	index("idx_data_upload_history_file_type").using("btree", table.fileType.asc().nullsLast().op("text_ops")),
	index("idx_data_upload_history_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
]);

// 订单记录表
export const orderRecords = pgTable("order_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeSystem: varchar("store_system", { length: 20 }).notNull(),
	storeId: varchar("store_id", { length: 100 }), // 门店ID
	storeName: varchar("store_name", { length: 255 }), // 门店名称（冗余存储便于查询）
	orderId: varchar("order_id", { length: 100 }), // 订单ID
	orderTime: timestamp("order_time", { withTimezone: true, mode: 'string' }), // 订单时间
	orderAmount: numeric("order_amount", { precision: 12, scale: 2 }).default('0'), // 订单金额
	actualAmount: numeric("actual_amount", { precision: 12, scale: 2 }).default('0'), // 实收金额
	channel: varchar("channel", { length: 50 }), // 渠道
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_order_records_store_system").using("btree", table.storeSystem.asc().nullsLast().op("text_ops")),
	index("idx_order_records_store_id").using("btree", table.storeId.asc().nullsLast().op("text_ops")),
	index("idx_order_records_order_time").using("btree", table.orderTime.asc().nullsLast().op("timestamptz_ops")),
	index("idx_order_records_store_system_time").on(table.storeSystem, table.orderTime),
]);

// 核销记录表
export const verifyRecords = pgTable("verify_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeSystem: varchar("store_system", { length: 20 }).notNull(),
	storeId: varchar("store_id", { length: 100 }), // 门店ID
	storeName: varchar("store_name", { length: 255 }), // 门店名称
	verifyId: varchar("verify_id", { length: 100 }), // 核销ID
	verifyTime: timestamp("verify_time", { withTimezone: true, mode: 'string' }), // 核销时间
	verifyAmount: numeric("verify_amount", { precision: 12, scale: 2 }).default('0'), // 核销金额
	channel: varchar("channel", { length: 50 }), // 渠道
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_verify_records_store_system").using("btree", table.storeSystem.asc().nullsLast().op("text_ops")),
	index("idx_verify_records_store_id").using("btree", table.storeId.asc().nullsLast().op("text_ops")),
	index("idx_verify_records_verify_time").using("btree", table.verifyTime.asc().nullsLast().op("timestamptz_ops")),
	index("idx_verify_records_store_system_time").on(table.storeSystem, table.verifyTime),
]);

// 退款记录表
export const refundRecords = pgTable("refund_records", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeSystem: varchar("store_system", { length: 20 }).notNull(),
	storeId: varchar("store_id", { length: 100 }), // 门店ID
	storeName: varchar("store_name", { length: 255 }), // 门店名称
	refundId: varchar("refund_id", { length: 100 }), // 退款ID
	refundTime: timestamp("refund_time", { withTimezone: true, mode: 'string' }), // 退款时间
	refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).default('0'), // 退款金额
	orderId: varchar("order_id", { length: 100 }), // 原订单ID
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_refund_records_store_system").using("btree", table.storeSystem.asc().nullsLast().op("text_ops")),
	index("idx_refund_records_store_id").using("btree", table.storeId.asc().nullsLast().op("text_ops")),
	index("idx_refund_records_refund_time").using("btree", table.refundTime.asc().nullsLast().op("timestamptz_ops")),
	index("idx_refund_records_store_system_time").on(table.storeSystem, table.refundTime),
]);

export const stores = pgTable("stores", {
	id: varchar({ length: 36 }).default(genUuid()).primaryKey().notNull(),
	storeName: varchar("store_name", { length: 255 }).notNull(),
	storeId: varchar("store_id", { length: 100 }),
	category: varchar({ length: 255 }),
	merchantName: varchar("merchant_name", { length: 255 }),
	region: varchar({ length: 100 }),
	province: varchar({ length: 100 }),
	city: varchar({ length: 100 }),
	address: text(),
	businessStatus: varchar("business_status", { length: 50 }),
	contactPhone: varchar("contact_phone", { length: 50 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	merchantPhone: varchar("merchant_phone", { length: 50 }),
	storeSystem: varchar("store_system", { length: 20 }).default('hecha'),
	storeArea: varchar("store_area", { length: 50 }),
	staffCount: varchar("staff_count", { length: 50 }),
	customerChannel: text("customer_channel"),
	attachStatus: varchar("attach_status"),
	phone1: varchar(),
	phone2: varchar(),
	phone3: varchar(),
	merchantId: varchar("merchant_id"),
	attachDate: varchar("attach_date", { length: 20 }),
}, (table) => [
	index("stores_city_idx").using("btree", table.city.asc().nullsLast().op("text_ops")),
	index("stores_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("stores_province_idx").using("btree", table.province.asc().nullsLast().op("text_ops")),
	index("stores_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("text_ops")),
	pgPolicy("stores_允许公开写入", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true`  }),
	pgPolicy("stores_允许公开删除", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("stores_允许公开更新", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("stores_允许公开读取", { as: "permissive", for: "select", to: ["public"] }),
]);
