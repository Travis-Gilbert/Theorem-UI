//! Parented child-surface geometry for contained webviews.
//!
//! Servo's `WindowRenderingContext` consumes a native handle. CommonPlace
//! DockArea panels need the full rectangle, so macOS gets a child `NSView`
//! with an independently movable frame. This crate does **not** depend on
//! Servo: hide/show/move must be testable without linking the engine.

use dpi::PhysicalSize;
use raw_window_handle::RawWindowHandle;

mod occlusion;

pub use occlusion::{OccluderRect, mask_holes};

/// A pane rectangle in physical device pixels, relative to the parent window.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Bounds {
    #[must_use]
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.width == 0 || self.height == 0
    }

    #[must_use]
    pub fn physical_size(&self) -> PhysicalSize<u32> {
        PhysicalSize {
            width: self.width.max(1),
            height: self.height.max(1),
        }
    }

    /// Origin relative to the parent window, in physical pixels.
    #[must_use]
    pub const fn physical_origin(&self) -> (i32, i32) {
        (self.x, self.y)
    }
}

/// Platform child surface that can be moved independently of the top-level window.
///
/// The native owner stays private so safe callers cannot manufacture or
/// duplicate an Objective-C pointer. Cleanup is automatic.
#[derive(Debug)]
pub struct ChildSurface {
    kind: ChildSurfaceKind,
}

#[derive(Debug)]
enum ChildSurfaceKind {
    /// Offscreen / software panes have no native child to move.
    None,
    /// macOS child NSView parented into the chrome-supplied view.
    #[cfg(target_os = "macos")]
    AppKit(macos::AppKitChild),
}

impl ChildSurface {
    #[must_use]
    pub fn none() -> Self {
        Self {
            kind: ChildSurfaceKind::None,
        }
    }

    #[must_use]
    pub fn appkit_window_handle(&self) -> Option<RawWindowHandle> {
        #[cfg(target_os = "macos")]
        if let ChildSurfaceKind::AppKit(child) = &self.kind {
            return Some(RawWindowHandle::AppKit(
                raw_window_handle::AppKitWindowHandle::new(child.view()),
            ));
        }
        None
    }

    pub fn apply(&self, bounds: Bounds) -> Result<(), String> {
        match &self.kind {
            ChildSurfaceKind::None => Ok(()),
            #[cfg(target_os = "macos")]
            ChildSurfaceKind::AppKit(child) => child.set_frame(bounds),
        }
    }

    pub fn set_visible(&self, visible: bool) -> Result<(), String> {
        match &self.kind {
            ChildSurfaceKind::None => Ok(()),
            #[cfg(target_os = "macos")]
            ChildSurfaceKind::AppKit(child) => child.set_visible(visible),
        }
    }

    /// Mask the child so whatever GPUI draws under each occluder shows through.
    ///
    /// Rects are in the child's own logical points with a top-left origin.
    /// An empty slice removes the mask. The set is kept and reapplied when
    /// the frame changes, because hole positions depend on the view height.
    pub fn set_occluders(&self, occluders: &[OccluderRect]) -> Result<(), String> {
        match &self.kind {
            ChildSurfaceKind::None => Ok(()),
            #[cfg(target_os = "macos")]
            ChildSurfaceKind::AppKit(child) => child.set_occluders(occluders),
        }
    }

    /// `isHidden` of this child view, not of a sibling GPUI layer.
    #[must_use]
    pub fn is_hidden(&self) -> Option<bool> {
        match &self.kind {
            ChildSurfaceKind::None => None,
            #[cfg(target_os = "macos")]
            ChildSurfaceKind::AppKit(child) => Some(child.is_hidden()),
        }
    }

    #[cfg(all(test, target_os = "macos"))]
    fn appkit_frame(&self) -> Option<(f64, f64, f64, f64)> {
        match &self.kind {
            ChildSurfaceKind::None => None,
            ChildSurfaceKind::AppKit(child) => Some(child.frame()),
        }
    }

    #[cfg(all(test, target_os = "macos"))]
    fn hit_test_is_transparent(&self) -> bool {
        match &self.kind {
            ChildSurfaceKind::None => false,
            ChildSurfaceKind::AppKit(child) => child.hit_test_is_transparent(),
        }
    }

    #[cfg(all(test, target_os = "macos"))]
    fn appkit_mask_shows(&self, x: f64, y: f64) -> Option<bool> {
        match &self.kind {
            ChildSurfaceKind::None => None,
            ChildSurfaceKind::AppKit(child) => child.mask_shows(x, y),
        }
    }
}

/// Create a positioned child surface inside a parented handle.
pub fn adopt_parented(window: RawWindowHandle, bounds: Bounds) -> Result<ChildSurface, String> {
    #[cfg(target_os = "macos")]
    {
        match window {
            RawWindowHandle::AppKit(handle) => {
                let child = macos::AppKitChild::new(handle.ns_view.as_ptr(), bounds)?;
                Ok(ChildSurface {
                    kind: ChildSurfaceKind::AppKit(child),
                })
            }
            other => Err(format!(
                "parented positioning is not implemented for {other:?} on macOS"
            )),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = bounds;
        Err(format!(
            "parented positioning is not implemented for {window:?} on this platform"
        ))
    }
}

/// Owned parent `NSView` that can host a child surface.
///
/// Hide/show/move oracles use this. It does not create an `NSWindow`, so cargo
/// libtests can run it off the main thread. Live parented Servo needs
/// [`AppKitWindow`].
#[cfg(target_os = "macos")]
pub struct AppKitParent {
    view: std::ptr::NonNull<std::ffi::c_void>,
}

#[cfg(target_os = "macos")]
impl AppKitParent {
    /// Allocate a parent `NSView` after touching `NSApplication`.
    pub fn new(bounds: Bounds) -> Result<Self, String> {
        macos::alloc_parent_view(bounds)
    }

    #[must_use]
    pub fn raw_window_handle(&self) -> RawWindowHandle {
        RawWindowHandle::AppKit(raw_window_handle::AppKitWindowHandle::new(self.view))
    }

    #[must_use]
    pub fn raw_display_handle() -> raw_window_handle::RawDisplayHandle {
        raw_window_handle::RawDisplayHandle::AppKit(raw_window_handle::AppKitDisplayHandle::new())
    }

    #[must_use]
    pub fn child_count(&self) -> usize {
        macos::subview_count(self.view)
    }

    #[must_use]
    pub fn first_child_hidden(&self) -> Option<bool> {
        macos::child_hidden(self.view, 0)
    }

    #[cfg(test)]
    fn backing_scale_factor(&self) -> f64 {
        macos::backing_scale_factor(self.view)
    }
}

#[cfg(target_os = "macos")]
impl Drop for AppKitParent {
    fn drop(&mut self) {
        macos::release_view(self.view);
    }
}

/// Count of AppKit subviews for a parented handle.
#[must_use]
pub fn appkit_child_count(window: RawWindowHandle) -> Option<usize> {
    #[cfg(target_os = "macos")]
    {
        if let RawWindowHandle::AppKit(handle) = window {
            return Some(macos::subview_count(handle.ns_view));
        }
    }
    let _ = window;
    None
}

/// `isHidden` of the first AppKit subview, if any.
#[must_use]
pub fn appkit_first_child_hidden(window: RawWindowHandle) -> Option<bool> {
    #[cfg(target_os = "macos")]
    {
        if let RawWindowHandle::AppKit(handle) = window {
            return macos::child_hidden(handle.ns_view, 0);
        }
    }
    let _ = window;
    None
}

/// `isHidden` of the last AppKit subview, if any.
#[must_use]
pub fn appkit_last_child_hidden(window: RawWindowHandle) -> Option<bool> {
    #[cfg(target_os = "macos")]
    {
        if let RawWindowHandle::AppKit(handle) = window {
            let count = macos::subview_count(handle.ns_view);
            if count == 0 {
                return None;
            }
            return macos::child_hidden(handle.ns_view, count - 1);
        }
    }
    let _ = window;
    None
}

/// Owned `NSWindow` whose content view can parent a Servo `WindowRenderingContext`.
///
/// Creating an `NSWindow` from a cargo libtest worker aborts (`foreign
/// exceptions`). Call this from a binary on the main thread.
#[cfg(target_os = "macos")]
pub struct AppKitWindow {
    window: std::ptr::NonNull<std::ffi::c_void>,
    view: std::ptr::NonNull<std::ffi::c_void>,
}

#[cfg(target_os = "macos")]
impl AppKitWindow {
    /// Create a titled window. Refuses off the main thread instead of aborting.
    pub fn new(bounds: Bounds) -> Result<Self, String> {
        macos::alloc_parent_window(bounds)
    }

    #[must_use]
    pub fn raw_window_handle(&self) -> RawWindowHandle {
        RawWindowHandle::AppKit(raw_window_handle::AppKitWindowHandle::new(self.view))
    }

    #[must_use]
    pub fn raw_display_handle() -> raw_window_handle::RawDisplayHandle {
        raw_window_handle::RawDisplayHandle::AppKit(raw_window_handle::AppKitDisplayHandle::new())
    }

    #[must_use]
    pub fn child_count(&self) -> usize {
        macos::subview_count(self.view)
    }

    #[must_use]
    pub fn first_child_hidden(&self) -> Option<bool> {
        macos::child_hidden(self.view, 0)
    }
}

#[cfg(target_os = "macos")]
impl Drop for AppKitWindow {
    fn drop(&mut self) {
        macos::close_window(self.window);
    }
}

#[cfg(target_os = "macos")]
#[link(name = "AppKit", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;
    use std::ffi::c_void;
    use std::ptr::NonNull;

    use objc::{
        Encode, class,
        declare::ClassDecl,
        msg_send,
        runtime::{Class, Object, Sel},
        sel, sel_impl,
    };
    use std::sync::OnceLock;

    use super::{AppKitParent, AppKitWindow, Bounds, OccluderRect, mask_holes};

    type Id = *mut Object;

    #[derive(Debug)]
    pub(super) struct AppKitChild {
        view: NonNull<c_void>,
        /// Last occluder set, kept so a frame change can rebuild the mask.
        occluders: RefCell<Vec<OccluderRect>>,
    }

    impl AppKitChild {
        pub(super) fn new(parent: *mut c_void, bounds: Bounds) -> Result<Self, String> {
            if parent.is_null() {
                return Err("parent NSView was null".into());
            }
            unsafe {
                let parent = parent as Id;
                let frame = points_rect(parent, bounds);
                let child: Id = msg_send![input_transparent_view_class(), alloc];
                let child: Id = msg_send![child, initWithFrame: frame];
                let Some(view) = NonNull::new(child as *mut c_void) else {
                    return Err("child NSView was null".into());
                };
                let _: () = msg_send![child, setWantsLayer: true];
                let _: () = msg_send![parent, addSubview: child];
                Ok(Self {
                    view,
                    occluders: RefCell::new(Vec::new()),
                })
            }
        }

        pub(super) fn view(&self) -> NonNull<c_void> {
            self.view
        }

        pub(super) fn set_frame(&self, bounds: Bounds) -> Result<(), String> {
            unsafe {
                let view = self.view.as_ptr() as Id;
                let parent: Id = msg_send![view, superview];
                if parent.is_null() {
                    return Err("child NSView has no superview".into());
                }
                let frame = points_rect(parent, bounds);
                let _: () = msg_send![view, setFrame: frame];
            }
            if self.occluders.borrow().is_empty() {
                Ok(())
            } else {
                self.apply_mask()
            }
        }

        pub(super) fn set_occluders(&self, occluders: &[OccluderRect]) -> Result<(), String> {
            *self.occluders.borrow_mut() = occluders.to_vec();
            self.apply_mask()
        }

        /// Rebuild `layer.mask` from the kept occluders.
        ///
        /// The mask is the layer bounds plus one hole per occluder, filled
        /// even-odd. surfman installs its own hosting layer after the child
        /// exists, so the layer is read fresh rather than cached.
        fn apply_mask(&self) -> Result<(), String> {
            let occluders = self.occluders.borrow();
            unsafe {
                let view = self.view.as_ptr() as Id;
                let wants_layer: bool = msg_send![view, wantsLayer];
                if !wants_layer {
                    let _: () = msg_send![view, setWantsLayer: true];
                }
                let layer: Id = msg_send![view, layer];
                if layer.is_null() {
                    return Err("child NSView has no layer to mask".into());
                }
                let _: () = msg_send![class!(CATransaction), begin];
                let _: () = msg_send![class!(CATransaction), setDisableActions: true];
                if occluders.is_empty() {
                    let none: Id = std::ptr::null_mut();
                    let _: () = msg_send![layer, setMask: none];
                } else {
                    let bounds: NSRect = msg_send![layer, bounds];
                    // An unflipped CALayer's y axis points up; occluders
                    // arrive with a top-left origin.
                    let flipped: bool = msg_send![layer, contentsAreFlipped];
                    let holes = mask_holes(
                        &occluders,
                        bounds.size.width,
                        bounds.size.height,
                        !flipped,
                    );
                    let path = CGPathCreateMutable();
                    let whole = NSRect {
                        origin: NSPoint { x: 0.0, y: 0.0 },
                        size: bounds.size,
                    };
                    CGPathAddRect(path, std::ptr::null(), whole);
                    for hole in &holes {
                        let rect = NSRect {
                            origin: NSPoint {
                                x: hole.x,
                                y: hole.y,
                            },
                            size: NSSize {
                                width: hole.w,
                                height: hole.h,
                            },
                        };
                        if hole.radius > 0.0 {
                            CGPathAddRoundedRect(
                                path,
                                std::ptr::null(),
                                rect,
                                hole.radius,
                                hole.radius,
                            );
                        } else {
                            CGPathAddRect(path, std::ptr::null(), rect);
                        }
                    }
                    let mask: Id = msg_send![class!(CAShapeLayer), alloc];
                    let mask: Id = msg_send![mask, init];
                    let _: () = msg_send![mask, setFrame: bounds];
                    let _: () = msg_send![mask, setPath: path as *const c_void];
                    let _: () = msg_send![mask, setFillRule: kCAFillRuleEvenOdd];
                    CGPathRelease(path);
                    let _: () = msg_send![layer, setMask: mask];
                    let _: () = msg_send![mask, release];
                }
                let _: () = msg_send![class!(CATransaction), commit];
            }
            Ok(())
        }

        /// Whether the mask lets the page show at `(x, y)` in layer space.
        #[cfg(test)]
        pub(super) fn mask_shows(&self, x: f64, y: f64) -> Option<bool> {
            unsafe {
                let view = self.view.as_ptr() as Id;
                let layer: Id = msg_send![view, layer];
                if layer.is_null() {
                    return None;
                }
                let mask: Id = msg_send![layer, mask];
                if mask.is_null() {
                    return None;
                }
                let rule: Id = msg_send![mask, fillRule];
                let even_odd: bool = msg_send![rule, isEqualToString: kCAFillRuleEvenOdd];
                assert!(even_odd, "the occlusion mask must fill even-odd");
                let path: *const c_void = msg_send![mask, path];
                Some(CGPathContainsPoint(
                    path,
                    std::ptr::null(),
                    NSPoint { x, y },
                    true,
                ))
            }
        }

        pub(super) fn set_visible(&self, visible: bool) -> Result<(), String> {
            unsafe {
                let view = self.view.as_ptr() as Id;
                let _: () = msg_send![view, setHidden: !visible];
            }
            Ok(())
        }

        pub(super) fn is_hidden(&self) -> bool {
            unsafe {
                let view = self.view.as_ptr() as Id;
                msg_send![view, isHidden]
            }
        }

        #[cfg(test)]
        pub(super) fn hit_test_is_transparent(&self) -> bool {
            unsafe {
                let view = self.view.as_ptr() as Id;
                let hit: Id = msg_send![view, hitTest: NSPoint { x: 1.0, y: 1.0 }];
                hit.is_null()
            }
        }

        #[cfg(test)]
        pub(super) fn frame(&self) -> (f64, f64, f64, f64) {
            unsafe {
                let view = self.view.as_ptr() as Id;
                let frame: NSRect = msg_send![view, frame];
                (
                    frame.origin.x,
                    frame.origin.y,
                    frame.size.width,
                    frame.size.height,
                )
            }
        }
    }

    fn input_transparent_view_class() -> &'static Class {
        static CLASS: OnceLock<&'static Class> = OnceLock::new();
        CLASS.get_or_init(|| {
            let mut declaration = ClassDecl::new("TheoremInputTransparentWebView", class!(NSView))
                .expect("webview child subclass name is unique");
            unsafe {
                declaration.add_method(
                    sel!(hitTest:),
                    hit_test_returns_nil as extern "C" fn(&Object, Sel, NSPoint) -> Id,
                );
            }
            declaration.register()
        })
    }

    extern "C" fn hit_test_returns_nil(_this: &Object, _selector: Sel, _point: NSPoint) -> Id {
        std::ptr::null_mut()
    }

    impl Drop for AppKitChild {
        fn drop(&mut self) {
            unsafe {
                let view = self.view.as_ptr() as Id;
                let _: () = msg_send![view, removeFromSuperview];
                let _: () = msg_send![view, release];
            }
        }
    }

    pub(super) fn alloc_parent_view(bounds: Bounds) -> Result<AppKitParent, String> {
        unsafe {
            let _: Id = msg_send![class!(NSApplication), sharedApplication];
            let frame = NSRect {
                origin: NSPoint { x: 0.0, y: 0.0 },
                size: NSSize {
                    width: f64::from(bounds.width.max(1)),
                    height: f64::from(bounds.height.max(1)),
                },
            };
            let view: Id = msg_send![class!(NSView), alloc];
            let view: Id = msg_send![view, initWithFrame: frame];
            let Some(view) = NonNull::new(view as *mut c_void) else {
                return Err("parent NSView was null".into());
            };
            Ok(AppKitParent { view })
        }
    }

    pub(super) fn alloc_parent_window(bounds: Bounds) -> Result<AppKitWindow, String> {
        unsafe {
            let is_main: bool = msg_send![class!(NSThread), isMainThread];
            if !is_main {
                return Err("NSWindow parent requires the main thread".into());
            }
            let _: Id = msg_send![class!(NSApplication), sharedApplication];
            let frame = NSRect {
                origin: NSPoint { x: 48.0, y: 48.0 },
                size: NSSize {
                    width: f64::from(bounds.width.max(1)),
                    height: f64::from(bounds.height.max(1)),
                },
            };
            let window: Id = msg_send![class!(NSWindow), alloc];
            let window: Id = msg_send![
                window,
                initWithContentRect: frame
                styleMask: 15u64
                backing: 2u64
                defer: false
            ];
            if window.is_null() {
                return Err("NSWindow alloc/init returned null".into());
            }
            let _: () = msg_send![window, setReleasedWhenClosed: false];
            let _: () = msg_send![window, orderFrontRegardless];
            let view: Id = msg_send![window, contentView];
            let Some(view) = NonNull::new(view as *mut c_void) else {
                let _: () = msg_send![window, close];
                let _: () = msg_send![window, release];
                return Err("NSWindow contentView was null".into());
            };
            let Some(window) = NonNull::new(window as *mut c_void) else {
                return Err("NSWindow pointer was null".into());
            };
            Ok(AppKitWindow { window, view })
        }
    }

    pub(super) fn release_view(view: NonNull<c_void>) {
        unsafe {
            let view = view.as_ptr() as Id;
            let _: () = msg_send![view, release];
        }
    }

    pub(super) fn close_window(window: NonNull<c_void>) {
        unsafe {
            let window = window.as_ptr() as Id;
            let _: () = msg_send![window, close];
            let _: () = msg_send![window, release];
        }
    }

    pub(super) fn subview_count(view: NonNull<c_void>) -> usize {
        unsafe {
            let view = view.as_ptr() as Id;
            let subviews: Id = msg_send![view, subviews];
            msg_send![subviews, count]
        }
    }

    pub(super) fn child_hidden(view: NonNull<c_void>, index: usize) -> Option<bool> {
        unsafe {
            let view = view.as_ptr() as Id;
            let subviews: Id = msg_send![view, subviews];
            let count: usize = msg_send![subviews, count];
            if index >= count {
                return None;
            }
            let child: Id = msg_send![subviews, objectAtIndex: index];
            let hidden: bool = msg_send![child, isHidden];
            Some(hidden)
        }
    }

    #[cfg(test)]
    pub(super) fn backing_scale_factor(view: NonNull<c_void>) -> f64 {
        unsafe {
            let view = view.as_ptr() as Id;
            let unit = NSRect {
                origin: NSPoint { x: 0.0, y: 0.0 },
                size: NSSize {
                    width: 1.0,
                    height: 1.0,
                },
            };
            let backing: NSRect = msg_send![view, convertRectToBacking: unit];
            backing.size.width
        }
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSPoint {
        x: f64,
        y: f64,
    }

    unsafe impl Encode for NSPoint {
        fn encode() -> objc::Encoding {
            unsafe { objc::Encoding::from_str("{CGPoint=dd}") }
        }
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSSize {
        width: f64,
        height: f64,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSRect {
        origin: NSPoint,
        size: NSSize,
    }

    // `NSRect` and `NSPoint` share `CGRect`/`CGPoint`'s layout on 64-bit.
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPathCreateMutable() -> *mut c_void;
        fn CGPathAddRect(path: *mut c_void, transform: *const c_void, rect: NSRect);
        fn CGPathAddRoundedRect(
            path: *mut c_void,
            transform: *const c_void,
            rect: NSRect,
            corner_width: f64,
            corner_height: f64,
        );
        fn CGPathRelease(path: *mut c_void);
        #[cfg(test)]
        fn CGPathContainsPoint(
            path: *const c_void,
            transform: *const c_void,
            point: NSPoint,
            even_odd: bool,
        ) -> bool;
    }

    #[link(name = "QuartzCore", kind = "framework")]
    extern "C" {
        static kCAFillRuleEvenOdd: *mut c_void;
    }

    fn points_rect(parent: Id, bounds: Bounds) -> NSRect {
        let physical = NSRect {
            origin: NSPoint {
                x: bounds.x as f64,
                y: bounds.y as f64,
            },
            size: NSSize {
                width: bounds.width.max(1) as f64,
                height: bounds.height.max(1) as f64,
            },
        };
        unsafe {
            let mut points: NSRect = msg_send![parent, convertRectFromBacking: physical];
            let flipped: bool = msg_send![parent, isFlipped];
            if !flipped {
                // Product pane coordinates start at the top-left. AppKit's
                // ordinary NSView starts at the bottom-left; backing-store
                // conversion scales pixels but does not change that origin.
                let parent_bounds: NSRect = msg_send![parent, bounds];
                points.origin.y = parent_bounds.origin.y + parent_bounds.size.height
                    - points.origin.y
                    - points.size.height;
            }
            points
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn parented_nsview_hides_shows_and_moves() {
        let parent = AppKitParent::new(Bounds::new(0, 0, 320, 200)).expect("parent NSView");
        let scale = parent.backing_scale_factor();
        let handle = parent.raw_window_handle();
        let child = adopt_parented(handle, Bounds::new(8, 12, 160, 90)).expect("child NSView");
        assert_eq!(
            child.appkit_frame(),
            Some((
                8.0 / scale,
                200.0 - 102.0 / scale,
                160.0 / scale,
                90.0 / scale
            )),
        );
        assert_eq!(parent.child_count(), 1, "adopt must add one child NSView");
        assert!(
            child.hit_test_is_transparent(),
            "the GPUI viewport owns input hit-testing"
        );
        assert_eq!(appkit_child_count(handle), Some(1));
        child
            .set_visible(false)
            .expect("hide must reach NSView setHidden");
        assert_eq!(child.is_hidden(), Some(true), "hide must set isHidden");
        assert_eq!(
            parent.first_child_hidden(),
            Some(true),
            "hide must set isHidden"
        );
        child.set_visible(true).expect("show must unhide the child");
        assert_eq!(
            parent.first_child_hidden(),
            Some(false),
            "show must clear isHidden"
        );
        child
            .apply(Bounds::new(24, 16, 200, 120))
            .expect("move must keep the child parented");
        assert_eq!(
            child.appkit_frame(),
            Some((
                24.0 / scale,
                200.0 - 136.0 / scale,
                200.0 / scale,
                120.0 / scale
            )),
        );
        assert_eq!(parent.child_count(), 1, "move must keep the same child");
        drop(child);
        assert_eq!(parent.child_count(), 0, "drop must remove the child NSView");
        assert_eq!(appkit_child_count(handle), Some(0));
    }

    #[test]
    fn occluders_mask_the_child_layer_with_even_odd_holes() {
        let parent = AppKitParent::new(Bounds::new(0, 0, 320, 200)).expect("parent NSView");
        let scale = parent.backing_scale_factor();
        let child = adopt_parented(parent.raw_window_handle(), Bounds::new(0, 0, 160, 90))
            .expect("child NSView");
        let (width, height) = (160.0 / scale, 90.0 / scale);
        assert_eq!(
            child.appkit_mask_shows(5.0, 5.0),
            None,
            "no occluders means no mask"
        );
        child
            .set_occluders(&[OccluderRect::new(0.0, 0.0, 20.0, 10.0, 0.0)])
            .expect("occluders must reach layer.mask");
        // The layer's y axis points up, so a top-left occluder is a hole
        // along the layer's top edge.
        assert_eq!(
            child.appkit_mask_shows(5.0, height - 5.0),
            Some(false),
            "the page must not paint under the occluder"
        );
        assert_eq!(
            child.appkit_mask_shows(5.0, 5.0),
            Some(true),
            "the page keeps painting below the occluder"
        );
        assert_eq!(
            child.appkit_mask_shows(width - 5.0, height - 5.0),
            Some(true),
            "the page keeps painting beside the occluder"
        );
        child
            .apply(Bounds::new(0, 0, 160, 180))
            .expect("move must keep the child parented");
        let taller = 180.0 / scale;
        assert_eq!(
            child.appkit_mask_shows(5.0, taller - 5.0),
            Some(false),
            "a frame change must rebuild the hole at the new top edge"
        );
        assert_eq!(
            child.appkit_mask_shows(5.0, height - 5.0),
            Some(true),
            "the old hole position must paint the page again"
        );
        child
            .set_occluders(&[])
            .expect("an empty set must clear the mask");
        assert_eq!(
            child.appkit_mask_shows(5.0, taller - 5.0),
            None,
            "an empty set removes layer.mask"
        );
    }

    #[test]
    fn nswindow_parent_refuses_off_the_main_thread() {
        match AppKitWindow::new(Bounds::new(0, 0, 64, 64)) {
            Err(reason) => assert!(
                reason.contains("main thread"),
                "must refuse instead of aborting: {reason}"
            ),
            Ok(_) => {}
        }
    }

    #[test]
    fn physical_size_never_reaches_the_engine_as_zero() {
        let size = Bounds::new(0, 0, 0, 0).physical_size();
        assert_eq!((size.width, size.height), (1, 1));
    }
}
