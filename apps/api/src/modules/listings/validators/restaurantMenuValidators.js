/**
 * Restaurant Menu module Zod validators (Pass 3 remediation) — structural
 * validation only, same split as `listingValidators.js`: business-rule
 * checks (ownership, RESTAURANT-only, unknown currency) live in
 * `RestaurantMenuService`.
 */

import { z } from 'zod';

const listingIdParams = z.object({ id: z.coerce.number().int().positive() });
const menuIdParams = z.object({
  menuId: z.coerce.number().int().positive(),
});
const sectionIdParams = z.object({
  sectionId: z.coerce.number().int().positive(),
});
const itemIdParams = z.object({
  itemId: z.coerce.number().int().positive(),
});
const emptyBody = z.object({}).optional();

export const listMenusSchema = z.object({
  params: listingIdParams,
  query: z.object({ locale: z.enum(['en', 'hy', 'ru']).optional() }),
  body: emptyBody,
});

export const createMenuSchema = z.object({
  params: listingIdParams,
  query: z.object({}).optional(),
  body: z.object({
    languageCode: z.enum(['en', 'hy', 'ru']).optional(),
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
});

export const updateMenuSchema = z.object({
  params: menuIdParams,
  query: z.object({}).optional(),
  body: z.object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
});

export const menuIdOnlySchema = z.object({
  params: menuIdParams,
  query: z.object({}).optional(),
  body: emptyBody,
});

export const createSectionSchema = z.object({
  params: menuIdParams,
  query: z.object({}).optional(),
  body: z.object({
    title: z.string().trim().min(1).max(150),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
});

export const updateSectionSchema = z.object({
  params: sectionIdParams,
  query: z.object({}).optional(),
  body: z.object({
    title: z.string().trim().min(1).max(150).optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
});

export const sectionIdOnlySchema = z.object({
  params: sectionIdParams,
  query: z.object({}).optional(),
  body: emptyBody,
});

const DIETARY_MARKERS = z
  .array(
    z.enum([
      'vegetarian',
      'vegan',
      'gluten-free',
      'dairy-free',
      'spicy',
      'nuts',
    ]),
  )
  .max(10)
  .optional();

export const createItemSchema = z.object({
  params: sectionIdParams,
  query: z.object({}).optional(),
  body: z.object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(1000).optional(),
    priceAmount: z.coerce.number().nonnegative(),
    priceCurrencyCode: z.string().trim().length(3),
    mediaId: z.coerce.number().int().positive().optional(),
    dietaryMarkers: DIETARY_MARKERS,
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
});

export const updateItemSchema = z.object({
  params: itemIdParams,
  query: z.object({}).optional(),
  body: z.object({
    title: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    priceAmount: z.coerce.number().nonnegative().optional(),
    priceCurrencyCode: z.string().trim().length(3).optional(),
    mediaId: z.coerce.number().int().positive().nullable().optional(),
    dietaryMarkers: DIETARY_MARKERS,
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  }),
});

export const itemIdOnlySchema = z.object({
  params: itemIdParams,
  query: z.object({}).optional(),
  body: emptyBody,
});
