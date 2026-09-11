/**
 * HeaderSearch — the Navbar's search entry point (Sprint G §17-21).
 * Added to `PublicLayout`'s `actions` fragment (auto-propagates into
 * `MobileNav` — see `Header.jsx`'s own `{actions}` usage), closing the
 * gap the Sprint G audit found: `PublicLayout.jsx` had no `navItems`
 * entry for Search at all (only reachable via the Explore dropdown's
 * fallback link or the Footer).
 *
 * Mirrors `NotificationBell.jsx`'s exact icon-button + `Popover
 * placement="bottom-end"` trigger pattern, and `SearchWidget.jsx`'s
 * exact submit logic (`destination` — the one canonical query param
 * `searchParams.js`/`buildWebsiteSchema()` already expect, a plain
 * `URLSearchParams` + `navigate`, never `buildLocaleUrl`, which is for
 * SEO canonical-tag construction only). A plain text `Input`, not
 * `DestinationAutocomplete` — that component lives under `modules/home/`
 * and this one lives under the shared `components/` tree, which
 * FRONTEND_ARCHITECTURE.md §6.3/§7's dependency-boundary lint rule
 * forbids importing from any `modules/*` tree (only a layout may); a
 * plain keyword field also matches spec §17-21's own "autocomplete is
 * NOT required unless a reusable component already makes it trivial" —
 * reusing it here isn't trivial, it would mean moving this whole
 * component under `modules/`. An empty submit still navigates to the
 * plain `/:locale/search` route (spec §21's "never a malformed URL" —
 * no query string is appended rather than one with an empty
 * `destination`).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Search as SearchIcon, MapPin } from 'lucide-react';
import { Popover } from '@desavii/ui/components/navigation';
import { Icon, Button } from '@desavii/ui/components/primitives';
import { Input } from '@desavii/ui/components/form-controls';
import styles from './HeaderSearch.module.scss';

export default function HeaderSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { locale } = useParams();
  const [isOpen, setIsOpen] = useState(false);
  const [destination, setDestination] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (destination.trim()) params.set('destination', destination.trim());
    const query = params.toString();
    setIsOpen(false);
    navigate(`/${locale}/search${query ? `?${query}` : ''}`);
  }

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      placement="bottom-end"
      panelClassName={styles.panel}
      trigger={
        // Remediation: this used to be icon-only (a bare 40x40 magnifying
        // glass with only an aria-label, no visible text) - functionally
        // reachable but not "obvious" at a glance among the header's
        // other icon-sized controls. A visible label is now the real
        // accessible name; the previous aria-label is redundant once
        // real text exists and has been dropped rather than kept
        // alongside it.
        <Button
          type="button"
          variant="ghost"
          className={styles.trigger}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          iconLeft={<Icon icon={SearchIcon} size="md" />}
          onClick={() => setIsOpen((current) => !current)}
        >
          {t('header.search.label')}
        </Button>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit} role="search">
        <Input
          aria-label={t('home.search.destinationLabel')}
          placeholder={t('header.search.placeholder')}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          iconLeft={<MapPin size={18} aria-hidden="true" />}
          autoFocus
        />
        <Button type="submit" variant="primary" fullWidth>
          {t('header.search.submitAction')}
        </Button>
      </form>
    </Popover>
  );
}
