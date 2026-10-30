import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useAskDesavii, { ASK_DRAFT_KEY } from './useAskDesavii.js';
import { useAuth } from '../../../contexts/AuthContext.jsx';
import {
  useAiSearchAvailabilityQuery,
  useParseSearchQueryMutation,
} from '../../ai/index.js';
import { useSearchFilterDefinitionsQuery } from '../../search/index.js';

vi.mock('../../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../ai/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useAiSearchAvailabilityQuery: vi.fn(),
  useParseSearchQueryMutation: vi.fn(),
}));
vi.mock('../../search/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useSearchFilterDefinitionsQuery: vi.fn(),
}));

const PARSED = {
  keyword: 'quiet breakfast parking',
  category_id: 1,
  category_name: 'Հյուրանոցներ',
  city_id: 4,
  city_name: 'Դիլիջան',
  amenity_ids: [7, 9],
};

const FILTER_GROUPS = [
  {
    code: 'AMENITIES',
    definitions: [
      {
        param: 'amenityIds',
        options: [
          { value: 7, code: 'Parking', label: 'Ավտոկայանատեղի' },
          { value: 9, code: 'Breakfast', label: 'Նախաճաշ' },
        ],
      },
    ],
  },
];

describe('useAskDesavii — Home AI-assisted discovery', () => {
  let mutation;

  beforeEach(() => {
    window.sessionStorage.clear();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useAiSearchAvailabilityQuery.mockReturnValue({
      isPending: false,
      data: true,
    });
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: FILTER_GROUPS });
    mutation = {
      mutate: vi.fn((variables, { onSuccess }) => onSuccess({ data: PARSED })),
      reset: vi.fn(),
      isPending: false,
      isError: false,
    };
    useParseSearchQueryMutation.mockReturnValue(mutation);
  });

  test('offers AI only when a real model answers — never the local stand-in', () => {
    useAiSearchAvailabilityQuery.mockReturnValue({
      isPending: false,
      data: false,
    });
    const { result } = renderHook(() => useAskDesavii());
    expect(result.current.status).toBe('unavailable');
    act(() => result.current.setPrompt('hotels in Dilijan'));
    act(() => result.current.ask());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  test('is still checking until availability is known', () => {
    useAiSearchAvailabilityQuery.mockReturnValue({ isPending: true });
    const { result } = renderHook(() => useAskDesavii());
    expect(result.current.status).toBe('checking');
  });

  test('a guest is asked to sign in, and the request is kept for the way back', () => {
    useAuth.mockReturnValue({ isAuthenticated: false });
    const { result } = renderHook(() => useAskDesavii());
    expect(result.current.status).toBe('signin');
    act(() => result.current.setPrompt('  Գյումրի երեխաների հետ '));
    act(() => result.current.keepForSignIn());
    expect(window.sessionStorage.getItem(ASK_DRAFT_KEY)).toBe(
      'Գյումրի երեխաների հետ',
    );
  });

  test('a kept request is restored after sign-in, then forgotten', () => {
    window.sessionStorage.setItem(ASK_DRAFT_KEY, 'Գյումրի երեխաների հետ');
    const { result } = renderHook(() => useAskDesavii());
    expect(result.current.prompt).toBe('Գյումրի երեխաների հետ');
    expect(window.sessionStorage.getItem(ASK_DRAFT_KEY)).toBeNull();
  });

  test('asks in the visitor’s language and shows each understood part, named from the real catalog', () => {
    const { result } = renderHook(() => useAskDesavii());
    act(() =>
      result.current.setPrompt(
        'Գտիր հանգիստ հյուրանոց Դիլիջանում նախաճաշով ու parking-ով',
      ),
    );
    act(() => result.current.ask());

    expect(mutation.mutate).toHaveBeenCalledWith(
      {
        query: 'Գտիր հանգիստ հյուրանոց Դիլիջանում նախաճաշով ու parking-ով',
        locale: 'hy',
      },
      expect.any(Object),
    );
    expect(result.current.intent).toEqual({
      destination: 'quiet breakfast parking',
      categoryId: 1,
      cityId: 4,
      dynamicFilters: { amenityIds: '7,9' },
    });
    expect(
      result.current.parts.map(({ type, label }) => [type, label]),
    ).toEqual([
      ['destination', 'Դիլիջան'],
      ['category', 'Հյուրանոցներ'],
      ['amenity', 'Ավտոկայանատեղի'],
      ['amenity', 'Նախաճաշ'],
      ['words', 'quiet breakfast parking'],
    ]);
  });

  test('removing a part removes exactly that choice from the search', () => {
    const { result } = renderHook(() => useAskDesavii());
    act(() => result.current.setPrompt('hotel in Dilijan'));
    act(() => result.current.ask());

    const parking = result.current.parts.find((part) => part.id === 7);
    act(() => result.current.removePart(parking));
    expect(result.current.intent.dynamicFilters).toEqual({ amenityIds: '9' });

    const city = result.current.parts.find(
      (part) => part.type === 'destination',
    );
    act(() => result.current.removePart(city));
    expect(result.current.intent.cityId).toBeUndefined();

    const category = result.current.parts.find(
      (part) => part.type === 'category',
    );
    act(() => result.current.removePart(category));
    expect(result.current.intent).toMatchObject({
      categoryId: undefined,
      dynamicFilters: {},
    });
  });

  test('a failed request keeps the words; editing them clears the error', () => {
    mutation.isError = true;
    const { result } = renderHook(() => useAskDesavii());
    act(() => result.current.setPrompt('hotel in Dilijan'));
    expect(result.current.hasFailed).toBe(true);
    expect(result.current.prompt).toBe('hotel in Dilijan');
    expect(mutation.reset).toHaveBeenCalled();
  });

  test('never sends an empty request, and caps its length', () => {
    const { result } = renderHook(() => useAskDesavii());
    act(() => result.current.setPrompt('   '));
    act(() => result.current.ask());
    expect(mutation.mutate).not.toHaveBeenCalled();
    act(() => result.current.setPrompt('x'.repeat(250)));
    expect(result.current.prompt).toHaveLength(200);
  });
});
