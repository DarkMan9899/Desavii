/**
 * CurrencyDropdown — DESAVII category-closure pass (§3). Replaces
 * `CurrencySwitcher`'s inline "AMD USD RUB" button row with one compact
 * "[ AMD ▾ ]" trigger that opens a dropdown of the same three options
 * below it — same `Popover` primitive `UserMenu.jsx` already uses for
 * exactly this trigger+panel shape (click-outside/Escape close,
 * positioning/z-index all come from there, not reinvented here).
 *
 * Reads/writes currency exclusively through `useCurrency()` — never a
 * second currency state, never touches `CurrencyProvider`'s own locale-
 * default/manual-override merge logic (`currency = override ??
 * defaultCurrency` in `CurrencyProvider.jsx`), so the brief's existing
 * "fresh locale defaults, manual override survives a later locale switch"
 * rule is completely unaffected by this UI change.
 */

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Popover } from '@desavii/ui/components/navigation';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { SUPPORTED_CURRENCIES } from '../../utils/currencyPolicy.js';
import styles from './CurrencyDropdown.module.scss';

export default function CurrencyDropdown() {
  const { t } = useTranslation();
  const { currency, setCurrency } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  function selectCurrency(code) {
    setCurrency(code);
    setIsOpen(false);
  }

  // Roving arrow-key navigation between the menu's own options — Popover
  // itself only owns click-outside/Escape (see its own header comment),
  // so a menu's internal arrow-key movement is each consumer's own
  // responsibility, same as this brief's explicit "keyboard navigation
  // works" requirement calls for.
  function handleMenuKeyDown(event) {
    const items = Array.from(
      menuRef.current?.querySelectorAll('[role="menuitemradio"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(currentIndex + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    }
  }

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      placement="bottom-start"
      panelClassName={styles.menu}
      trigger={
        <button
          type="button"
          className={styles.trigger}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t('a11y.switchCurrency')}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className={styles.triggerValue}>{currency}</span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={[styles.triggerIcon, isOpen && styles.triggerIconOpen]
              .filter(Boolean)
              .join(' ')}
          />
        </button>
      }
    >
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        aria-label={t('a11y.switchCurrency')}
        onKeyDown={handleMenuKeyDown}
      >
        {SUPPORTED_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            role="menuitemradio"
            aria-checked={code === currency}
            className={[
              styles.menuItem,
              code === currency && styles.menuItemActive,
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => selectCurrency(code)}
          >
            {code}
          </button>
        ))}
      </div>
    </Popover>
  );
}
