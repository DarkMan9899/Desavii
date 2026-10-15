/**
 * Real-browser assertions for the shared `Select`'s open list, used by the
 * booking room selector and shared Select specs: what a customer can see
 * and tap, measured in the page itself (jsdom has no layout).
 */

import { expect } from './fixtures.js';

/**
 * Every option of the open list can be brought into view inside the list
 * and is then fully on screen and the element a tap at its centre reaches
 * — nothing clipped by a container or painted over by another layer.
 */
export async function expectEveryOptionReachable(page) {
  const results = await page.getByRole('listbox').evaluate((listbox) =>
    [...listbox.querySelectorAll('[role=option]')].map((option) => {
      option.scrollIntoView({ block: 'nearest' });
      const r = option.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return {
        name: option.textContent.slice(0, 40),
        onScreen:
          r.top >= 0 &&
          r.left >= 0 &&
          r.bottom <= window.innerHeight &&
          r.right <= window.innerWidth,
        reachable: hit === option || option.contains(hit),
        textClipped: option.scrollWidth > option.clientWidth + 1,
      };
    }),
  );
  expect(results.length).toBeGreaterThan(0);
  results.forEach((result) => {
    expect(result, result.name).toMatchObject({
      onScreen: true,
      reachable: true,
      textClipped: false,
    });
  });
}

/** The open list's panel sits entirely inside the viewport as it opens. */
export async function expectPanelInViewport(page) {
  const panel = await page.getByRole('listbox').evaluate((listbox) => {
    const r = listbox.parentElement.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(panel.top).toBeGreaterThanOrEqual(0);
  expect(panel.left).toBeGreaterThanOrEqual(0);
  expect(panel.bottom).toBeLessThanOrEqual(panel.viewportHeight);
  expect(panel.right).toBeLessThanOrEqual(panel.viewportWidth);
}

export async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}
