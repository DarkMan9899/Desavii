/**
 * Which sidebar item is the current page's section — shared by the Admin,
 * Partner and Customer Account layouts.
 *
 * The longest `href` that is the pathname itself or a path prefix of it
 * (`/en/admin/users` owns `/en/admin/users/42`) wins, so a detail page
 * highlights its parent section, and `/en/admin/ai/usage` never lights up
 * a hypothetical `/en/admin/ai` item. An item marked `exact` — a workspace
 * root such as the Admin Dashboard — matches only its own path: otherwise
 * it would claim every page whose section has no visible item (a section
 * a role cannot open), highlighting an unrelated entry. A trailing slash
 * on the pathname is ignored; query strings are never part of it.
 */

function normalize(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export default function findActiveNavItemId(items, pathname) {
  const path = normalize(pathname);
  let best = null;
  items.forEach((item) => {
    const matches =
      path === item.href || (!item.exact && path.startsWith(`${item.href}/`));
    if (matches && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  });
  return best?.id;
}
