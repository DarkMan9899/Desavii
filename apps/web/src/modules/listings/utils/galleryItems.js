/**
 * galleryItems — a listing's (or a room's) media as the gallery shows it:
 * photos and videos only (a DOCUMENT has no place in a visual gallery), in
 * the partner's order, with a safe URL and meaningful alt text.
 *
 * Media URLs come from the API but are still treated as untrusted: an item
 * whose URL is not a same-origin path or an http(s) URL is dropped, never
 * rendered (`safeMediaUrl`, shared with every listing card).
 *
 * Alt text (Phase 20 SEO §17): the partner's `alt_text`, then the
 * `caption`, then "{title} — photo N of total" — never empty, never
 * keyword-stuffed.
 */

import { safeMediaUrl } from '../../../utils/listingCardModel.js';

const VISUAL_MEDIA_TYPES = Object.freeze(['IMAGE', 'VIDEO']);

/**
 * @param {Array<object>} media - `toPublicMediaResponse` items.
 * @param {string} title - the listing or room title, for the alt fallback.
 * @param {Function} t - i18next `t`.
 * @returns {Array<{id: number|string, type: 'IMAGE'|'VIDEO', url: string, thumbnailUrl: string, alt: string, caption: string|null}>}
 */
export function toGalleryItems(media, title, t) {
  const visual = (media ?? [])
    .filter((item) => VISUAL_MEDIA_TYPES.includes(item.media_type))
    .map((item) => ({ item, url: safeMediaUrl(item.url) }))
    .filter(({ url }) => url !== null)
    .sort((a, b) => (a.item.position ?? 0) - (b.item.position ?? 0));
  const total = visual.length;
  return visual.map(({ item, url }, index) => ({
    id: item.id,
    type: item.media_type,
    url,
    thumbnailUrl: safeMediaUrl(item.thumbnail_url) ?? url,
    alt:
      item.alt_text ||
      item.caption ||
      t('pages.listingDetail.gallery.imageAltFallback', {
        title,
        index: index + 1,
        total,
      }),
    caption: item.caption ?? null,
  }));
}

export default toGalleryItems;
