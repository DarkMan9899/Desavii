/**
 * useMenuPreorder — the guest's dish choices for a restaurant reservation
 * (docs/BOOKING_WIDGET_REBUILD.md §5): which dishes, how many of each, and
 * the priced lines and subtotal derived from the partner's current menu.
 *
 * Only quantities are state; titles and prices are always read from the
 * menu itself, so a menu refetch can never leave a stale price on screen.
 * A dish that disappears from the menu drops out of the pre-order.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  buildPreorderLines,
  clampPreorderQuantity,
  resolveOrderableSections,
} from '../utils/menuPreorder.js';

export default function useMenuPreorder(menus) {
  const [quantities, setQuantities] = useState({});
  const sections = useMemo(() => resolveOrderableSections(menus), [menus]);
  const preorder = useMemo(
    () => buildPreorderLines(sections, quantities),
    [sections, quantities],
  );

  const setQuantity = useCallback((menuItemId, nextQuantity) => {
    setQuantities((current) => ({
      ...current,
      [menuItemId]: clampPreorderQuantity(current, menuItemId, nextQuantity),
    }));
  }, []);

  const removeItems = useCallback((menuItemIds) => {
    setQuantities((current) => {
      const next = { ...current };
      menuItemIds.forEach((id) => delete next[id]);
      return next;
    });
  }, []);

  const clear = useCallback(() => setQuantities({}), []);

  return {
    sections,
    quantities,
    preorder,
    hasMenu: sections.length > 0,
    hasSelection: preorder.lines.length > 0,
    setQuantity,
    removeItems,
    clear,
  };
}
