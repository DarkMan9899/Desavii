/**
 * Restaurant Menu response DTOs (Pass 3 remediation). Mirrors
 * `listingDto.js`'s `toHighlightResponse`/etc. shape — snake_case wire
 * fields, `language_code` never a raw id.
 */

export function toMenuItemResponse(item) {
  return {
    id: item.id,
    section_id: item.sectionId,
    title: item.title,
    description: item.description,
    price_amount: item.priceAmount,
    price_currency_code: item.priceCurrencyCode,
    media_id: item.mediaId,
    dietary_markers: item.dietaryMarkers ?? [],
    is_active: item.isActive,
    sort_order: item.sortOrder,
  };
}

export function toMenuSectionResponse(section) {
  return {
    id: section.id,
    menu_id: section.menuId,
    title: section.title,
    sort_order: section.sortOrder,
    items: (section.items ?? []).map(toMenuItemResponse),
  };
}

export function toMenuResponse(menu) {
  return {
    id: menu.id,
    listing_id: menu.listingId,
    language_code: menu.languageCode,
    name: menu.name,
    description: menu.description,
    is_active: menu.isActive,
    sort_order: menu.sortOrder,
    sections: (menu.sections ?? []).map(toMenuSectionResponse),
  };
}
