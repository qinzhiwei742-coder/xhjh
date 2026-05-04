import { relations } from "drizzle-orm/relations";
import { stores, followRecords, robotConfigs, followImages, storeTags } from "./schema";

export const followRecordsRelations = relations(followRecords, ({one, many}) => ({
	store: one(stores, {
		fields: [followRecords.storeId],
		references: [stores.id]
	}),
	followImages: many(followImages),
}));

export const storesRelations = relations(stores, ({many}) => ({
	followRecords: many(followRecords),
	robotConfigs: many(robotConfigs),
	storeTags: many(storeTags),
}));

export const robotConfigsRelations = relations(robotConfigs, ({one}) => ({
	store: one(stores, {
		fields: [robotConfigs.storeId],
		references: [stores.id]
	}),
}));

export const followImagesRelations = relations(followImages, ({one}) => ({
	followRecord: one(followRecords, {
		fields: [followImages.followRecordId],
		references: [followRecords.id]
	}),
}));

export const storeTagsRelations = relations(storeTags, ({one}) => ({
	store: one(stores, {
		fields: [storeTags.storeId],
		references: [stores.id]
	}),
}));