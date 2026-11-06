// SOURCING: @openuidev/react-lang's own auto-mount guard. The package has no option for this: importing it mounts OpenUI Inspect in development, unless this flag says it already has.
//
// Inspect loads its code from jsDelivr at a loose version tag. This module has
// to run before react-lang does, so __root.tsx imports it first.
Object.assign(globalThis, { [Symbol.for('openui.devtools.autoMount')]: true })
