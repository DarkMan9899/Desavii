/**
 * PublicLayout — chrome for the Customer Website route tree.
 * Implements FRONTEND_ARCHITECTURE.md §5.1.
 *
 * Phase 10 redesign: the primary nav grew from Home/Search only to a
 * real information architecture — an "Explore" dropdown populated from
 * real search categories (`useCategoriesQuery`, the `search` module's
 * public export — a layout is allowed to import from `modules/*`, unlike
 * `components/*`, per FRONTEND_ARCHITECTURE.md §6.3/§7), plus Companies
 * and Become a Partner. The footer grew from 2 columns to 4 (Explore,
 * Company, Support, Account), and every link still points at a route
 * that exists by the end of this phase (Companies/About/Contact/FAQ/
 * Help Center/Blog/Become a Partner all ship in this same phase — see
 * `docs/` Phase 10 plan). Currency switcher remains deliberately absent
 * (see PublicLayout's Phase 10 known-limitation note in the final
 * report) — sticky search remains deferred too.
 */

import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppLayout from './AppLayout.jsx';
import Header from '../components/Header/Header.jsx';
import Footer from '../components/Footer/Footer.jsx';
import UserMenu from '../components/UserMenu/UserMenu.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher/LanguageSwitcher.jsx';
import HeaderSearch from '../components/HeaderSearch/HeaderSearch.jsx';
import { useCategoriesQuery } from '../modules/search/index.js';
import { NotificationBell } from '../modules/notifications/index.js';
import { MessagingBell } from '../modules/messaging/index.js';
import { AiAssistantTrigger } from '../modules/ai/index.js';
import useSiteJsonLd from '../seo/useSiteJsonLd.js';

export default function PublicLayout() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { data: categories } = useCategoriesQuery({ locale: i18n.language });
  useSiteJsonLd(locale);

  const exploreItem =
    categories && categories.length > 0
      ? {
          label: t('nav.explore'),
          // Phase 20 (SEO): points at the real, indexable category
          // landing page (previously `?category=<slug>` — a query param
          // `useSearchFilters`/`searchParams.js` never actually parses,
          // so this menu silently landed on unfiltered Search before).
          items: categories.map((category) => ({
            label: category.name,
            to: `/${locale}/categories/${category.slug}`,
          })),
        }
      : { label: t('nav.explore'), to: `/${locale}/search` };

  const navItems = [
    { label: t('nav.home'), to: `/${locale}` },
    exploreItem,
    { label: t('nav.companies'), to: `/${locale}/companies` },
    { label: t('nav.becomePartner'), to: `/${locale}/become-a-partner` },
  ];

  const footerColumns = [
    {
      title: t('footer.explore'),
      links: [
        { label: t('footer.links.home'), to: `/${locale}` },
        { label: t('footer.links.search'), to: `/${locale}/search` },
        { label: t('footer.links.companies'), to: `/${locale}/companies` },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { label: t('footer.links.about'), to: `/${locale}/about` },
        { label: t('footer.links.contact'), to: `/${locale}/contact` },
        {
          label: t('footer.links.becomePartner'),
          to: `/${locale}/become-a-partner`,
        },
        { label: t('footer.links.blog'), to: `/${locale}/blog` },
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { label: t('footer.links.faq'), to: `/${locale}/faq` },
        { label: t('footer.links.helpCenter'), to: `/${locale}/help` },
        {
          // "Support" and "Contact" both point at the same real page —
          // it's the one place we honestly have support info (email,
          // phone, hours). No separate /support route/content exists.
          label: t('footer.links.support'),
          to: `/${locale}/contact`,
        },
      ],
    },
    {
      title: t('footer.account'),
      links: [
        { label: t('footer.links.login'), to: `/${locale}/auth/login` },
        { label: t('footer.links.register'), to: `/${locale}/auth/register` },
        {
          label: t('footer.links.partner'),
          to: `/${locale}/become-a-partner`,
        },
      ],
    },
  ];

  return (
    <AppLayout
      header={
        <Header
          logo={t('app.name')}
          homeHref={`/${locale}`}
          navItems={navItems}
          actions={
            <>
              <HeaderSearch />
              <LanguageSwitcher />
              <MessagingBell />
              <NotificationBell />
              <AiAssistantTrigger />
              <UserMenu />
            </>
          }
        />
      }
      footer={
        <Footer
          columns={footerColumns}
          bottomText={`© ${new Date().getFullYear()} ${t('app.name')}`}
        />
      }
    >
      <Outlet />
    </AppLayout>
  );
}
