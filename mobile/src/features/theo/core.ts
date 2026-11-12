// SOURCING: Theorem-UI src/lib/face (engine, feature, identity, program, book), the same pure core the web page and the desktop host draw from. Nothing is copied: these are re-exports of the files at the repository root, which Metro reads through watchFolders (metro.config.js).
//
// The phone's one door to Theo's core. Everything the phone knows about how
// Theo looks or moves comes through here, so there is no second definition to
// drift. Web-only parts of lib/face (the luma renderer, the Rapier body, the
// zustand store, the client operations) are not exported: the phone has its
// own host for those.
export { Face, plainGaze, SLEEP_AFTER_MS } from '../../../../src/lib/face/engine'
export type { FaceOptions, Head, Performed } from '../../../../src/lib/face/engine'
export { outlinePath, restShape, seatPoint } from '../../../../src/lib/face/feature'
export type { Shape } from '../../../../src/lib/face/feature'
export { THEO } from '../../../../src/lib/face/identity'
export type { Program } from '../../../../src/lib/face/program'
export type { Liveness } from '../../../../src/lib/kit/liveness'
