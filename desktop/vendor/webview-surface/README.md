# webview-surface

Parented native child-surface geometry for contained IDE webviews.

`browser-embed` still owns Servo. This crate owns the panel rectangle and the
macOS child `NSView`, so hide/show/move oracles do not link libservo. Product
panes call `adopt_parented` from the embedder; tests here prove the AppKit
child without constructing an engine.
