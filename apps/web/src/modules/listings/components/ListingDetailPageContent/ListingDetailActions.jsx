/**
 * ListingDetailActions — the header's page actions: ask Desavii AI about
 * this listing, share it, save it (the favourite shows only to a signed-in
 * traveller).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Inline } from '@desavii/ui/components/layout';
import ShareButton from '../../../../components/ShareButton/ShareButton.jsx';
import { FavoriteButton } from '../../../favorites/index.js';
import { AskAiButton } from '../../../ai/index.js';

export default function ListingDetailActions({ listingId, title }) {
  const { t } = useTranslation();
  return (
    <Inline gap="2" align="center">
      <AskAiButton
        label={t('ai.contextButtons.askAboutListing')}
        contextType="listing"
        contextId={listingId}
        initialMessage={t('ai.contextButtons.listingInitialMessage')}
        variant="ghost"
        size="sm"
      />
      <ShareButton title={title} />
      <FavoriteButton listingId={listingId} />
    </Inline>
  );
}

ListingDetailActions.propTypes = {
  listingId: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
};
