import availabilityKeys from '../constants/queryKeys.js';

/**
 * Every view a manual block changes: the listing's blocks list and every
 * open per-day breakdown/ledger (the Partner calendar's day statuses and
 * source dots read the breakdown). Shared by create, edit and release so
 * the three can never drift apart.
 */
export function invalidateInventoryBlockViews(queryClient, listingId) {
  queryClient.invalidateQueries({
    queryKey: availabilityKeys.blocks(listingId),
  });
  queryClient.invalidateQueries({
    queryKey: [...availabilityKeys.all, 'breakdown'],
  });
  queryClient.invalidateQueries({
    queryKey: [...availabilityKeys.all, 'ledger'],
  });
}

export default invalidateInventoryBlockViews;
