/**
 * `favorites` module public export surface (FRONTEND_ARCHITECTURE.md
 * §6.2) — the ONLY entry point another module/page may import from
 * (§6.3). Consumed by `listings`/`search` (`FavoriteButton` on cards)
 * and `routes` (`FavoritesPageContent`).
 */

export { default as FavoriteButton } from './components/FavoriteButton/FavoriteButton.jsx';
// The shared listing card for a favourite (Favorites page, account dashboard).
export { default as FavoriteListingCard } from './components/FavoriteListingCard/FavoriteListingCard.jsx';
export { default as FavoritesPageContent } from './components/FavoritesPageContent/FavoritesPageContent.jsx';
export { useFavoritesQuery } from './queries/useFavoritesQuery.js';
