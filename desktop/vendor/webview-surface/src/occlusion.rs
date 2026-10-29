//! Native occlusion geometry for a parented webview child.
//!
//! GPUI paints beneath the child `NSView`, so an overlay GPUI draws over a
//! page would be hidden by it. The child's layer is masked instead: the mask
//! is the full bounds plus one hole per occluder, filled even-odd, so GPUI
//! shows through each hole while Servo keeps its size. This module is the
//! pure geometry; the AppKit half lives beside `AppKitChild`.

use std::cmp::Ordering;

/// Shorter than this, in points, a side or an overlap counts as nothing.
const EPSILON: f64 = 1e-6;

/// A rounded rectangle drawn over the child, in the child's own logical
/// points with a top-left origin.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct OccluderRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub radius: f64,
}

impl OccluderRect {
    #[must_use]
    pub const fn new(x: f64, y: f64, w: f64, h: f64, radius: f64) -> Self {
        Self { x, y, w, h, radius }
    }

    fn right(&self) -> f64 {
        self.x + self.w
    }

    fn bottom(&self) -> f64 {
        self.y + self.h
    }

    fn is_finite(&self) -> bool {
        [self.x, self.y, self.w, self.h, self.radius]
            .iter()
            .all(|value| value.is_finite())
    }

    fn overlaps(&self, other: &Self) -> bool {
        self.x.max(other.x) + EPSILON < self.right().min(other.right())
            && self.y.max(other.y) + EPSILON < self.bottom().min(other.bottom())
    }

    fn order(&self, other: &Self) -> Ordering {
        self.x
            .total_cmp(&other.x)
            .then(self.y.total_cmp(&other.y))
            .then(self.w.total_cmp(&other.w))
            .then(self.h.total_cmp(&other.h))
            .then(self.radius.total_cmp(&other.radius))
    }
}

/// Holes for the child's mask path, in the masked layer's coordinate space.
///
/// Each occluder is clipped to the `width` x `height` view; empty, zero-area
/// and non-finite rects are dropped and exact duplicates collapse. Under the
/// even-odd rule two overlapping holes would fill their intersection again
/// and paint the page over both overlays, so overlapping occluders are
/// replaced by disjoint square rects covering their union. A clipped
/// occluder loses its radius: its rounded corner lies outside the view, and
/// a square hole errs toward showing GPUI rather than painting the page over
/// the overlay. `flip_y` converts the top-left origin for a layer whose y
/// axis points up. The result is sorted, so equal inputs give equal masks.
#[must_use]
pub fn mask_holes(
    occluders: &[OccluderRect],
    width: f64,
    height: f64,
    flip_y: bool,
) -> Vec<OccluderRect> {
    if !(width.is_finite() && height.is_finite()) || width <= EPSILON || height <= EPSILON {
        return Vec::new();
    }
    let mut clipped: Vec<OccluderRect> = Vec::with_capacity(occluders.len());
    for rect in occluders
        .iter()
        .filter_map(|occluder| clip(occluder, width, height))
    {
        if !clipped.contains(&rect) {
            clipped.push(rect);
        }
    }
    let mut holes = Vec::with_capacity(clipped.len());
    for cluster in overlap_clusters(&clipped) {
        if let [only] = cluster.as_slice() {
            holes.push(clipped[*only]);
        } else {
            let members: Vec<OccluderRect> = cluster.iter().map(|&index| clipped[index]).collect();
            holes.extend(square_union(&members));
        }
    }
    if flip_y {
        for hole in &mut holes {
            hole.y = height - hole.y - hole.h;
        }
    }
    holes.sort_by(OccluderRect::order);
    holes
}

fn clip(occluder: &OccluderRect, width: f64, height: f64) -> Option<OccluderRect> {
    if !occluder.is_finite() {
        return None;
    }
    let left = occluder.x.max(0.0);
    let top = occluder.y.max(0.0);
    let right = occluder.right().min(width);
    let bottom = occluder.bottom().min(height);
    let (w, h) = (right - left, bottom - top);
    if w <= EPSILON || h <= EPSILON {
        return None;
    }
    let was_clipped = left > occluder.x
        || top > occluder.y
        || right < occluder.right()
        || bottom < occluder.bottom();
    let radius = if was_clipped {
        0.0
    } else {
        occluder.radius.max(0.0).min(w / 2.0).min(h / 2.0)
    };
    Some(OccluderRect::new(left, top, w, h, radius))
}

/// Indices grouped by positive-area overlap, in first-seen order.
fn overlap_clusters(rects: &[OccluderRect]) -> Vec<Vec<usize>> {
    fn root(parent: &mut [usize], mut index: usize) -> usize {
        while parent[index] != index {
            parent[index] = parent[parent[index]];
            index = parent[index];
        }
        index
    }

    let mut parent: Vec<usize> = (0..rects.len()).collect();
    for first in 0..rects.len() {
        for second in first + 1..rects.len() {
            if rects[first].overlaps(&rects[second]) {
                let (a, b) = (root(&mut parent, first), root(&mut parent, second));
                if a != b {
                    parent[b] = a;
                }
            }
        }
    }
    let mut slot_of_root = vec![usize::MAX; rects.len()];
    let mut clusters: Vec<Vec<usize>> = Vec::new();
    for index in 0..rects.len() {
        let cluster_root = root(&mut parent, index);
        if slot_of_root[cluster_root] == usize::MAX {
            slot_of_root[cluster_root] = clusters.len();
            clusters.push(Vec::new());
        }
        clusters[slot_of_root[cluster_root]].push(index);
    }
    clusters
}

/// Disjoint square rects covering the union of `rects`.
///
/// A sweep over the distinct x edges: each slab's covered y spans are merged,
/// and a span that continues unchanged from the previous slab widens that
/// rect instead of starting a new one.
fn square_union(rects: &[OccluderRect]) -> Vec<OccluderRect> {
    let mut edges: Vec<f64> = rects
        .iter()
        .flat_map(|rect| [rect.x, rect.right()])
        .collect();
    edges.sort_by(f64::total_cmp);
    edges.dedup();
    let mut out: Vec<OccluderRect> = Vec::new();
    let mut previous: Vec<(f64, f64, usize)> = Vec::new();
    for slab in edges.windows(2) {
        let (left, right) = (slab[0], slab[1]);
        let mut spans: Vec<(f64, f64)> = rects
            .iter()
            .filter(|rect| rect.x <= left && rect.right() >= right)
            .map(|rect| (rect.y, rect.bottom()))
            .collect();
        spans.sort_by(|a, b| a.0.total_cmp(&b.0));
        let mut merged: Vec<(f64, f64)> = Vec::with_capacity(spans.len());
        for (top, bottom) in spans {
            match merged.last_mut() {
                Some(last) if top <= last.1 => last.1 = last.1.max(bottom),
                _ => merged.push((top, bottom)),
            }
        }
        let mut current = Vec::with_capacity(merged.len());
        for (top, bottom) in merged {
            let continued = previous
                .iter()
                .find(|(previous_top, previous_bottom, _)| {
                    *previous_top == top && *previous_bottom == bottom
                })
                .map(|(_, _, slot)| *slot);
            let slot = match continued {
                Some(slot) => {
                    out[slot].w = right - out[slot].x;
                    slot
                }
                None => {
                    out.push(OccluderRect::new(left, top, right - left, bottom - top, 0.0));
                    out.len() - 1
                }
            };
            current.push((top, bottom, slot));
        }
        previous = current;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, w: f64, h: f64, radius: f64) -> OccluderRect {
        OccluderRect::new(x, y, w, h, radius)
    }

    #[test]
    fn occlusion_holes_keep_a_rounded_occluder_inside_the_view() {
        let holes = mask_holes(&[rect(10.0, 20.0, 100.0, 50.0, 8.0)], 300.0, 200.0, false);
        assert_eq!(holes, vec![rect(10.0, 20.0, 100.0, 50.0, 8.0)]);
    }

    #[test]
    fn occlusion_holes_flip_y_for_a_layer_whose_axis_points_up() {
        let holes = mask_holes(&[rect(10.0, 20.0, 100.0, 50.0, 8.0)], 300.0, 200.0, true);
        assert_eq!(holes, vec![rect(10.0, 130.0, 100.0, 50.0, 8.0)]);
        let top_strip = mask_holes(&[rect(0.0, 0.0, 300.0, 10.0, 0.0)], 300.0, 200.0, true);
        assert_eq!(
            top_strip,
            vec![rect(0.0, 190.0, 300.0, 10.0, 0.0)],
            "a top-left overlay must land at the top of an upward layer"
        );
    }

    #[test]
    fn occlusion_holes_clip_to_bounds_and_square_the_clipped_corner() {
        let holes = mask_holes(&[rect(-20.0, 150.0, 100.0, 80.0, 12.0)], 300.0, 200.0, false);
        assert_eq!(holes, vec![rect(0.0, 150.0, 80.0, 50.0, 0.0)]);
    }

    #[test]
    fn occlusion_holes_clamp_radius_to_half_the_short_side() {
        let holes = mask_holes(&[rect(10.0, 10.0, 40.0, 10.0, 30.0)], 300.0, 200.0, false);
        assert_eq!(holes, vec![rect(10.0, 10.0, 40.0, 10.0, 5.0)]);
        let negative = mask_holes(&[rect(10.0, 10.0, 40.0, 10.0, -3.0)], 300.0, 200.0, false);
        assert_eq!(negative, vec![rect(10.0, 10.0, 40.0, 10.0, 0.0)]);
    }

    #[test]
    fn occlusion_holes_drop_empty_zero_area_outside_and_non_finite_rects() {
        let holes = mask_holes(
            &[
                rect(10.0, 10.0, 0.0, 40.0, 0.0),
                rect(10.0, 10.0, 40.0, 0.0, 0.0),
                rect(10.0, 10.0, -40.0, 40.0, 0.0),
                rect(400.0, 10.0, 40.0, 40.0, 0.0),
                rect(10.0, -80.0, 40.0, 40.0, 0.0),
                rect(f64::NAN, 10.0, 40.0, 40.0, 0.0),
                rect(10.0, 10.0, f64::INFINITY, 40.0, 0.0),
                rect(5.0, 5.0, 10.0, 10.0, 2.0),
            ],
            300.0,
            200.0,
            false,
        );
        assert_eq!(
            holes,
            vec![rect(5.0, 5.0, 10.0, 10.0, 2.0)],
            "only the real occluder survives beside the rejected ones"
        );
        assert!(mask_holes(&[rect(0.0, 0.0, 10.0, 10.0, 0.0)], 0.0, 200.0, false).is_empty());
    }

    #[test]
    fn occlusion_holes_dedupe_exact_duplicates() {
        let occluder = rect(10.0, 10.0, 40.0, 40.0, 6.0);
        let holes = mask_holes(&[occluder, occluder, occluder], 300.0, 200.0, false);
        assert_eq!(holes, vec![occluder], "even-odd would cancel a doubled hole");
    }

    #[test]
    fn occlusion_holes_replace_overlaps_with_a_disjoint_square_union() {
        let holes = mask_holes(
            &[rect(0.0, 0.0, 100.0, 50.0, 8.0), rect(80.0, 20.0, 60.0, 60.0, 8.0)],
            300.0,
            200.0,
            false,
        );
        assert_eq!(
            holes,
            vec![
                rect(0.0, 0.0, 80.0, 50.0, 0.0),
                rect(80.0, 0.0, 20.0, 80.0, 0.0),
                rect(100.0, 20.0, 40.0, 60.0, 0.0),
            ]
        );
        for (index, first) in holes.iter().enumerate() {
            for second in &holes[index + 1..] {
                assert!(!first.overlaps(second), "{first:?} overlaps {second:?}");
            }
        }
        let area: f64 = holes.iter().map(|hole| hole.w * hole.h).sum();
        assert_eq!(area, 100.0 * 50.0 + 60.0 * 60.0 - 20.0 * 30.0);
    }

    #[test]
    fn occlusion_holes_fold_a_contained_occluder_into_its_container() {
        let holes = mask_holes(
            &[rect(10.0, 10.0, 100.0, 100.0, 4.0), rect(30.0, 30.0, 20.0, 20.0, 4.0)],
            300.0,
            200.0,
            false,
        );
        assert_eq!(holes, vec![rect(10.0, 10.0, 100.0, 100.0, 0.0)]);
    }

    #[test]
    fn occlusion_holes_keep_touching_occluders_rounded_and_separate() {
        let holes = mask_holes(
            &[rect(0.0, 0.0, 50.0, 50.0, 6.0), rect(50.0, 0.0, 50.0, 50.0, 6.0)],
            300.0,
            200.0,
            false,
        );
        assert_eq!(
            holes,
            vec![rect(0.0, 0.0, 50.0, 50.0, 6.0), rect(50.0, 0.0, 50.0, 50.0, 6.0)],
            "a shared edge has no area, so even-odd leaves both holes open"
        );
    }

    #[test]
    fn occlusion_holes_are_order_independent() {
        let a = rect(0.0, 0.0, 30.0, 30.0, 2.0);
        let b = rect(100.0, 40.0, 30.0, 30.0, 2.0);
        assert_eq!(
            mask_holes(&[a, b], 300.0, 200.0, true),
            mask_holes(&[b, a], 300.0, 200.0, true)
        );
    }
}
