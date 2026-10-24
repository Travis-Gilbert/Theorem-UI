---
auto_encode: 1
---

# Base UI's drawer CSS variables do not reach the popup's children

Base UI's Drawer.Popup sets `--drawer-snap-point-offset`, `--drawer-swipe-movement-y` and the others inline, and also registers them with `@property { inherits: false }`. So the popup itself can use them, but any descendant reads the registered initial value (`0px`), not the popup's.

This came up with snap points on the bottom terminal drawer. The popup is as tall as the highest snap point and is translated down by the offset, so the terminal inside has to be only as tall as the part that shows: `calc(100% - offset)`. On a child, that calc silently resolved with an offset of 0, and the prompt sat off-screen.

The fix is to re-export the variable on the popup under an unregistered name, which does inherit:

```tsx
<Drawer.Popup className="[--shown-offset:var(--drawer-snap-point-offset)] ...">
  <div className="h-[calc(100%-var(--shown-offset)-12px)]">...</div>
</Drawer.Popup>
```

To check, compare `getComputedStyle(child).getPropertyValue('--drawer-snap-point-offset')` with the popup's value. The child shows `0px` while the popup shows the real offset.

Related: with snap points, a fast flick skips snap points or dismisses, based on velocity. When the height is meant to be chosen deliberately, `snapToSequentialPoints` makes drag distance decide the stop.
