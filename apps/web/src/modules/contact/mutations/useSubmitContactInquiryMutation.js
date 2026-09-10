/**
 * `useSubmitContactInquiryMutation` — wraps `POST /contact` (Sprint G).
 * No cache to invalidate: the public Contact form has nothing else on
 * the page reading this data.
 */

import { useMutation } from '@tanstack/react-query';
import { submitContactInquiry } from '../../../api/contact.js';

export function useSubmitContactInquiryMutation() {
  return useMutation({ mutationFn: submitContactInquiry });
}

export default useSubmitContactInquiryMutation;
