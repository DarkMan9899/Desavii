/**
 * SceneKit — the SVG scene foundation for TOP ambient scenes (introduced
 * in the design-tooling setup step; `useGsapScene` added for the TOP
 * live-scene motion upgrade). `SceneStage`/`useParallaxPointer`/the
 * primitives remain opt-in scaffolding, not wired into the 9 category
 * environments; `useGsapScene` IS used by all 9 as of the motion upgrade
 * — see its own header comment.
 */

export { default as SceneStage } from './SceneStage.jsx';
export { default as useParallaxPointer } from './useParallaxPointer.js';
export { default as useGsapScene } from './useGsapScene.js';
export * from './primitives/index.js';
