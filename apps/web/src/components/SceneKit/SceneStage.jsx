/**
 * SceneStage — the FAR/MID/NEAR root wrapper every `*TopBackground.jsx`
 * currently hand-rolls (design-tooling setup, brief step 6). Wires
 * `useParallaxPointer` onto the root node and applies the `.static`
 * reduced-motion modifier class, exactly matching the existing 9
 * components' own established pattern — a future TOP environment can
 * render `<SceneStage far={...} mid={...} near={...} />` instead of
 * re-deriving this wiring. Purely structural: it owns no visual styling
 * itself (a caller's own CSS module still defines `.environment`/`.far`/
 * `.mid`/`.near`/`.static`, same as every existing component).
 *
 * Not wired into any of the 9 existing environments in this step — see
 * `useParallaxPointer.js`'s header comment for why.
 */

import PropTypes from 'prop-types';

export default function SceneStage({
  far = null,
  mid = null,
  near = null,
  rootRef,
  pointerHandlers,
  prefersReducedMotion,
  environmentClassName,
  farClassName = undefined,
  midClassName = undefined,
  nearClassName = undefined,
  staticClassName,
}) {
  return (
    <div
      ref={rootRef}
      className={[environmentClassName, prefersReducedMotion && staticClassName]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
      // eslint-disable-next-line react/jsx-props-no-spreading -- forwards the pointer handlers computed by useParallaxPointer, or nothing when parallax is disabled
      {...pointerHandlers}
    >
      {far && <div className={farClassName}>{far}</div>}
      {mid && <div className={midClassName}>{mid}</div>}
      {near && <div className={nearClassName}>{near}</div>}
    </div>
  );
}

SceneStage.propTypes = {
  far: PropTypes.node,
  mid: PropTypes.node,
  near: PropTypes.node,
  // eslint-disable-next-line react/forbid-prop-types -- a ref object, not a plain value prop
  rootRef: PropTypes.object.isRequired,
  pointerHandlers: PropTypes.shape({
    onPointerMove: PropTypes.func,
    onPointerLeave: PropTypes.func,
  }).isRequired,
  prefersReducedMotion: PropTypes.bool.isRequired,
  environmentClassName: PropTypes.string.isRequired,
  farClassName: PropTypes.string,
  midClassName: PropTypes.string,
  nearClassName: PropTypes.string,
  staticClassName: PropTypes.string.isRequired,
};
