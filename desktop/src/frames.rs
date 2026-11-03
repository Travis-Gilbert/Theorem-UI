//! How the page's frames are going, for the frame-time comparison between the
//! child view and the in-scene renderer (plan Phase 0, item 6). The driver's
//! `frames` step reads and resets it.
//!
//! SOURCING: std's clocks; the summary is a sort and three lookups.

use std::time::{Duration, Instant};

use serde_json::{Value, json};

#[derive(Default)]
pub struct FrameStats {
    last: Option<Instant>,
    /// Between one frame from Servo and the next.
    intervals: Vec<Duration>,
    /// Servo's `paint` and the context's `present`, on the main thread.
    painting: Vec<Duration>,
    /// From `present` to GPUI building the frame that shows it (in-scene only).
    to_scene: Vec<Duration>,
    presented: Option<Instant>,
}

impl FrameStats {
    pub fn painted(&mut self, started: Instant) {
        let now = Instant::now();
        if let Some(last) = self.last {
            self.intervals.push(started - last);
        }
        self.last = Some(started);
        self.painting.push(now - started);
        self.presented = Some(now);
    }

    /// GPUI is drawing the newest frame; counts once per frame.
    pub fn drawn(&mut self) {
        if let Some(presented) = self.presented.take() {
            self.to_scene.push(presented.elapsed());
        }
    }

    /// The last frame's painting time, for the in-scene overlay.
    pub fn last_painting(&self) -> Option<Duration> {
        self.painting.last().copied()
    }

    pub fn frames(&self) -> usize {
        self.painting.len()
    }

    pub fn take_summary(&mut self) -> Value {
        let summary = json!({
            "frames": self.painting.len(),
            "intervalMs": summarize(&mut self.intervals),
            "paintingMs": summarize(&mut self.painting),
            "toSceneMs": summarize(&mut self.to_scene),
        });
        *self = Self::default();
        summary
    }
}

fn summarize(samples: &mut [Duration]) -> Value {
    if samples.is_empty() {
        return Value::Null;
    }
    samples.sort();
    let ms = |duration: Duration| (duration.as_secs_f64() * 1e5).round() / 100.0;
    let at = |fraction: f64| samples[((samples.len() - 1) as f64 * fraction).round() as usize];
    let total: Duration = samples.iter().sum();
    json!({
        "mean": ms(total / samples.len() as u32),
        "p50": ms(at(0.5)),
        "p95": ms(at(0.95)),
        "max": ms(at(1.0)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_summary_reports_and_resets() {
        let mut stats = FrameStats::default();
        let start = Instant::now();
        stats.painted(start);
        stats.drawn();
        stats.drawn();
        stats.painted(start + Duration::from_millis(16));
        let summary = stats.take_summary();
        assert_eq!(summary["frames"], 2);
        assert_eq!(summary["intervalMs"]["p50"], 16.0);
        assert!(summary["toSceneMs"].is_object(), "one draw counted");
        assert_eq!(stats.take_summary()["frames"], 0);
    }
}
