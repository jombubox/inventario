import { relations } from "drizzle-orm";

import { account, session, user } from "@/db/schema/auth";
import {
  brandAliases,
  brands,
  componentTypeAliases,
  componentTypes,
} from "@/db/schema/catalog";
import { inventoryItems, inventoryMovements } from "@/db/schema/inventory";
import { locations } from "@/db/schema/locations";
import { auditLogs, importJobRows, importJobs } from "@/db/schema/operations";
import { productCompatibilities, productImages, products } from "@/db/schema/products";

export const brandsRelations = relations(brands, ({ many }) => ({
  aliases: many(brandAliases),
  products: many(products),
  compatibilities: many(productCompatibilities),
}));

export const brandAliasesRelations = relations(brandAliases, ({ one }) => ({
  brand: one(brands, {
    fields: [brandAliases.brandId],
    references: [brands.id],
  }),
}));

export const componentTypesRelations = relations(componentTypes, ({ many }) => ({
  aliases: many(componentTypeAliases),
  products: many(products),
}));

export const componentTypeAliasesRelations = relations(componentTypeAliases, ({ one }) => ({
  componentType: one(componentTypes, {
    fields: [componentTypeAliases.componentTypeId],
    references: [componentTypes.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  componentType: one(componentTypes, {
    fields: [products.componentTypeId],
    references: [componentTypes.id],
  }),
  compatibilities: many(productCompatibilities),
  images: many(productImages),
  inventoryItems: many(inventoryItems),
}));

export const productCompatibilitiesRelations = relations(
  productCompatibilities,
  ({ one }) => ({
    product: one(products, {
      fields: [productCompatibilities.productId],
      references: [products.id],
    }),
    brand: one(brands, {
      fields: [productCompatibilities.brandId],
      references: [brands.id],
    }),
  }),
);

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  parent: one(locations, {
    fields: [locations.parentId],
    references: [locations.id],
    relationName: "locationHierarchy",
  }),
  children: many(locations, { relationName: "locationHierarchy" }),
  inventoryItems: many(inventoryItems),
  movementsFrom: many(inventoryMovements, { relationName: "movementFromLocation" }),
  movementsTo: many(inventoryMovements, { relationName: "movementToLocation" }),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  product: one(products, {
    fields: [inventoryItems.productId],
    references: [products.id],
  }),
  location: one(locations, {
    fields: [inventoryItems.locationId],
    references: [locations.id],
  }),
  movements: many(inventoryMovements),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  inventoryItem: one(inventoryItems, {
    fields: [inventoryMovements.inventoryItemId],
    references: [inventoryItems.id],
  }),
  fromLocation: one(locations, {
    fields: [inventoryMovements.fromLocationId],
    references: [locations.id],
    relationName: "movementFromLocation",
  }),
  toLocation: one(locations, {
    fields: [inventoryMovements.toLocationId],
    references: [locations.id],
    relationName: "movementToLocation",
  }),
  user: one(user, {
    fields: [inventoryMovements.userId],
    references: [user.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  inventoryMovements: many(inventoryMovements),
  auditLogs: many(auditLogs),
  importJobs: many(importJobs),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(user, { fields: [auditLogs.userId], references: [user.id] }),
}));

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  creator: one(user, { fields: [importJobs.createdBy], references: [user.id] }),
  rows: many(importJobRows),
}));

export const importJobRowsRelations = relations(importJobRows, ({ one }) => ({
  importJob: one(importJobs, {
    fields: [importJobRows.importJobId],
    references: [importJobs.id],
  }),
  product: one(products, {
    fields: [importJobRows.productId],
    references: [products.id],
  }),
  inventoryItem: one(inventoryItems, {
    fields: [importJobRows.inventoryItemId],
    references: [inventoryItems.id],
  }),
}));
