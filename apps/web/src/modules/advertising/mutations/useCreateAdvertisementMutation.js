import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAdvertisement } from '../../../api/advertising.js';
import advertisingKeys from '../constants/queryKeys.js';

/** `POST /advertising/admin` — invalidates every admin list view. */
export function useCreateAdvertisementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createAdvertisement(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: advertisingKeys.lists() });
    },
  });
}

export default useCreateAdvertisementMutation;
