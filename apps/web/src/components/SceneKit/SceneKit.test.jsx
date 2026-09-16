/**
 * Smoke tests for the SceneKit foundation (design-tooling setup, brief
 * step 6) — proves each primitive and the SceneStage/useParallaxPointer
 * wiring renders without crashing. Not exercised by any production route
 * yet (see SceneKit/index.js's own header comment), so this is the only
 * current test coverage for these files.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import {
  SceneStage,
  useParallaxPointer,
  RouteLine,
  WaypointNode,
  SpotlightBeam,
  ParticleField,
  Silhouette,
} from './index.js';

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('SceneKit foundation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('useParallaxPointer returns a ref and pointer handlers', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useParallaxPointer());
    expect(result.current.rootRef).toBeDefined();
    expect(result.current.pointerHandlers.onPointerMove).toBeInstanceOf(
      Function,
    );
  });

  test('useParallaxPointer disables handlers under prefers-reduced-motion', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useParallaxPointer());
    expect(result.current.pointerHandlers.onPointerMove).toBeUndefined();
  });

  test('SceneStage renders far/mid/near layers and is decorative', () => {
    mockMatchMedia(false);
    const { rootRef, pointerHandlers, prefersReducedMotion } = renderHook(() =>
      useParallaxPointer(),
    ).result.current;
    const { container } = render(
      <SceneStage
        rootRef={rootRef}
        pointerHandlers={pointerHandlers}
        prefersReducedMotion={prefersReducedMotion}
        environmentClassName="environment"
        farClassName="far"
        midClassName="mid"
        nearClassName="near"
        staticClassName="static"
        far={<span>far-content</span>}
        mid={<span>mid-content</span>}
        near={<span>near-content</span>}
      />,
    );
    const root = container.firstChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.far')).toBeInTheDocument();
    expect(container.querySelector('.mid')).toBeInTheDocument();
    expect(container.querySelector('.near')).toBeInTheDocument();
  });

  test('primitives each render valid SVG markup without crashing', () => {
    const { container } = render(
      <svg>
        <RouteLine d="M0 0 L10 10" className="route" />
        <WaypointNode cx={5} cy={5} className="waypoint" stemLength={4} />
        <SpotlightBeam
          apexX={10}
          apexY={0}
          baseLeftX={0}
          baseRightX={20}
          baseY={20}
          gradientId="testGradient"
          className="beam"
        />
        <g>
          <ParticleField
            particles={[{ left: '10%', bottom: '10%', size: 4, delay: '0s' }]}
            className="particle"
          />
        </g>
        <Silhouette kind="person" className="silhouette" />
      </svg>,
    );
    expect(container.querySelector('.route')).toBeInTheDocument();
    expect(container.querySelector('.waypoint')).toBeInTheDocument();
    expect(container.querySelector('.beam')).toBeInTheDocument();
    expect(container.querySelector('.particle')).toBeInTheDocument();
    expect(container.querySelector('.silhouette')).toBeInTheDocument();
  });
});
