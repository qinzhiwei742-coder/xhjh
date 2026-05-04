-- 创建所有数据表
-- 对应 Drizzle ORM schema.ts 的定义

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS health_check (
    id SERIAL PRIMARY KEY,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
    id VARCHAR(36) DEFAULT gen_random_uuid() PRIMARY KEY,
    store_name VARCHAR(255) NOT NULL,
    store_id VARCHAR(100),
    category VARCHAR(255),
    merchant_name VARCHAR(255),
    region VARCHAR(100),
    province VARCHAR(100),
    city VARCHAR(100),
    address TEXT,
    business_status VARCHAR(50),
    contact_phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ,
    merchant_phone VARCHAR(50),
    store_system VARCHAR(20) DEFAULT 'hecha',
    store_area VARCHAR(50),
    staff_count VARCHAR(50),
    customer_channel TEXT,
    attach_status VARCHAR(50),
    phone1 VARCHAR(50),
    phone2 VARCHAR(50),
    phone3 VARCHAR(50),
    merchant_id VARCHAR(100),
    attach_date VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    position VARCHAR(100),
    phone VARCHAR(50),
    wechat VARCHAR(100),
    remark TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    wecom_id VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS operation_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(100),
    operation_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    resource_name VARCHAR(255),
    detail TEXT,
    store_system VARCHAR(50) DEFAULT 'hecha',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tag_presets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tag_name VARCHAR(50) NOT NULL UNIQUE,
    tag_color VARCHAR(20) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_staff (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    password VARCHAR(100) DEFAULT '123456' NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follow_records (
    id VARCHAR(36) DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id VARCHAR(36) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    follow_time TIMESTAMPTZ NOT NULL,
    remark TEXT,
    ai_analysis TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ,
    next_follow_time TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS robot_configs (
    id VARCHAR(36) DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id VARCHAR(36) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    robot_name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS follow_images (
    id VARCHAR(36) DEFAULT gen_random_uuid() PRIMARY KEY,
    follow_record_id VARCHAR(36) NOT NULL REFERENCES follow_records(id) ON DELETE CASCADE,
    image_key VARCHAR(500) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS store_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id VARCHAR(36) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    tag_name VARCHAR(50) NOT NULL,
    tag_color VARCHAR(20) DEFAULT '#165dff',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_images (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL,
    image_key VARCHAR(500) NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_file_history (
    id VARCHAR(36) DEFAULT gen_random_uuid() PRIMARY KEY,
    file_type VARCHAR(20) NOT NULL,
    store_system VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_key VARCHAR(500) NOT NULL,
    file_size INTEGER,
    min_time VARCHAR(50),
    max_time VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    uploaded_by VARCHAR(255),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS ad_expense_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_system VARCHAR(20) NOT NULL,
    account_index INTEGER NOT NULL,
    store_id VARCHAR(100),
    store_name VARCHAR(255),
    spend NUMERIC(12, 2) DEFAULT 0,
    orders INTEGER DEFAULT 0,
    record_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_upload_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_system VARCHAR(20) NOT NULL,
    file_type VARCHAR(20) NOT NULL,
    file_name VARCHAR(255),
    record_count INTEGER DEFAULT 0,
    min_time VARCHAR(50),
    max_time VARCHAR(50),
    uploaded_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS order_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_system VARCHAR(20) NOT NULL,
    store_id VARCHAR(100),
    store_name VARCHAR(255),
    order_id VARCHAR(100),
    order_time TIMESTAMPTZ,
    order_amount NUMERIC(12, 2) DEFAULT 0,
    actual_amount NUMERIC(12, 2) DEFAULT 0,
    channel VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS verify_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_system VARCHAR(20) NOT NULL,
    store_id VARCHAR(100),
    store_name VARCHAR(255),
    verify_id VARCHAR(100),
    verify_time TIMESTAMPTZ,
    verify_amount NUMERIC(12, 2) DEFAULT 0,
    channel VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS refund_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_system VARCHAR(20) NOT NULL,
    store_id VARCHAR(100),
    store_name VARCHAR(255),
    refund_id VARCHAR(100),
    refund_time TIMESTAMPTZ,
    refund_amount NUMERIC(12, 2) DEFAULT 0,
    order_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_contacts_store_id ON contacts(store_id);
CREATE INDEX IF NOT EXISTS idx_contacts_is_primary ON contacts(is_primary);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operation_logs_operation_type ON operation_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_operation_logs_resource_type ON operation_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_operation_logs_store_system ON operation_logs(store_system);
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS follow_records_created_at_idx ON follow_records(created_at);
CREATE INDEX IF NOT EXISTS follow_records_follow_time_idx ON follow_records(follow_time);
CREATE INDEX IF NOT EXISTS follow_records_store_id_idx ON follow_records(store_id);
CREATE INDEX IF NOT EXISTS robot_configs_is_active_idx ON robot_configs(is_active);
CREATE INDEX IF NOT EXISTS robot_configs_store_id_idx ON robot_configs(store_id);
CREATE INDEX IF NOT EXISTS follow_images_follow_record_id_idx ON follow_images(follow_record_id);
CREATE INDEX IF NOT EXISTS idx_store_tags_store_id ON store_tags(store_id);
CREATE INDEX IF NOT EXISTS idx_store_tags_tag_name ON store_tags(tag_name);
CREATE INDEX IF NOT EXISTS data_file_history_created_at_idx ON data_file_history(created_at);
CREATE INDEX IF NOT EXISTS data_file_history_file_type_idx ON data_file_history(file_type);
CREATE INDEX IF NOT EXISTS data_file_history_is_active_idx ON data_file_history(is_active);
CREATE INDEX IF NOT EXISTS data_file_history_store_system_idx ON data_file_history(store_system);
CREATE INDEX IF NOT EXISTS idx_ad_expense_account ON ad_expense_records(store_system, account_index);
CREATE INDEX IF NOT EXISTS idx_ad_expense_store_id ON ad_expense_records(store_system, account_index, store_id);
CREATE INDEX IF NOT EXISTS idx_ad_expense_store_system ON ad_expense_records(store_system);
CREATE INDEX IF NOT EXISTS idx_data_upload_history_store_system ON data_upload_history(store_system);
CREATE INDEX IF NOT EXISTS idx_data_upload_history_file_type ON data_upload_history(file_type);
CREATE INDEX IF NOT EXISTS idx_data_upload_history_created_at ON data_upload_history(created_at);
CREATE INDEX IF NOT EXISTS idx_order_records_store_system ON order_records(store_system);
CREATE INDEX IF NOT EXISTS idx_order_records_store_id ON order_records(store_id);
CREATE INDEX IF NOT EXISTS idx_order_records_order_time ON order_records(order_time);
CREATE INDEX IF NOT EXISTS idx_order_records_store_system_time ON order_records(store_system, order_time);
CREATE INDEX IF NOT EXISTS idx_verify_records_store_system ON verify_records(store_system);
CREATE INDEX IF NOT EXISTS idx_verify_records_store_id ON verify_records(store_id);
CREATE INDEX IF NOT EXISTS idx_verify_records_verify_time ON verify_records(verify_time);
CREATE INDEX IF NOT EXISTS idx_verify_records_store_system_time ON verify_records(store_system, verify_time);
CREATE INDEX IF NOT EXISTS idx_refund_records_store_system ON refund_records(store_system);
CREATE INDEX IF NOT EXISTS idx_refund_records_store_id ON refund_records(store_id);
CREATE INDEX IF NOT EXISTS idx_refund_records_refund_time ON refund_records(refund_time);
CREATE INDEX IF NOT EXISTS idx_refund_records_store_system_time ON refund_records(store_system, refund_time);
CREATE INDEX IF NOT EXISTS stores_city_idx ON stores(city);
CREATE INDEX IF NOT EXISTS stores_created_at_idx ON stores(created_at);
CREATE INDEX IF NOT EXISTS stores_province_idx ON stores(province);
CREATE INDEX IF NOT EXISTS stores_store_id_idx ON stores(store_id);
