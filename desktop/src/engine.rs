//! The one Servo instance (plan D2): built on the GPUI main thread, woken
//! through GPUI's foreground executor rather than by polling.
//!
//! SOURCING: `ServoBuilder` and Servo's `EventLoopWaker`; GPUI's foreground
//! executor and a `futures` channel carry the wake to the main thread.

use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::StreamExt as _;
use futures::channel::mpsc::{UnboundedReceiver, UnboundedSender, unbounded};
use gpui_kit::{App, AsyncApp, Global};
use servo::{EventLoopWaker, Opts, Preferences, Servo, ServoBuilder};

/// Servo calls `wake` from its own threads; this only posts to the foreground.
/// `pending` folds a burst of wakes into one turn of the event loop.
#[derive(Clone)]
struct ChannelWaker {
    sender: UnboundedSender<()>,
    pending: Arc<AtomicBool>,
}

impl EventLoopWaker for ChannelWaker {
    fn clone_box(&self) -> Box<dyn EventLoopWaker> {
        Box::new(self.clone())
    }

    fn wake(&self) {
        if !self.pending.swap(true, Ordering::AcqRel) {
            let _ = self.sender.unbounded_send(());
        }
    }
}

pub struct Engine {
    pub servo: Servo,
    /// Runs after every turn of Servo's event loop, so the delegates' queued
    /// events reach their views once Servo has let go of them.
    after_spin: Vec<Box<dyn FnMut(&mut App)>>,
}

impl Global for Engine {}

impl Engine {
    /// Build Servo with durable storage under `profile_dir` and start the task
    /// that turns its wake-ups into `spin_event_loop` calls.
    pub fn start(profile_dir: &Path, cx: &mut App) {
        let (sender, receiver) = unbounded();
        let pending = Arc::new(AtomicBool::new(false));
        let mut opts = Opts::default();
        opts.config_dir = Some(profile_dir.to_path_buf());
        let servo = ServoBuilder::default()
            .opts(opts)
            .preferences(Preferences::default())
            .event_loop_waker(Box::new(ChannelWaker {
                sender,
                pending: pending.clone(),
            }))
            .build();
        servo.setup_logging();
        cx.set_global(Engine {
            servo,
            after_spin: Vec::new(),
        });
        cx.spawn(async move |cx| spin(receiver, pending, cx).await)
            .detach();
    }

    pub fn servo(cx: &App) -> Servo {
        cx.global::<Engine>().servo.clone()
    }

    pub fn after_spin(callback: impl FnMut(&mut App) + 'static, cx: &mut App) {
        cx.global_mut::<Engine>().after_spin.push(Box::new(callback));
    }
}

async fn spin(mut wakes: UnboundedReceiver<()>, pending: Arc<AtomicBool>, cx: &mut AsyncApp) {
    while wakes.next().await.is_some() {
        pending.store(false, Ordering::Release);
        cx.update(|cx| {
            let servo = Engine::servo(cx);
            servo.spin_event_loop();
            // Take the callbacks out so they can reach `cx` mutably.
            let mut callbacks = std::mem::take(&mut cx.global_mut::<Engine>().after_spin);
            for callback in &mut callbacks {
                callback(cx);
            }
            let engine = cx.global_mut::<Engine>();
            callbacks.append(&mut engine.after_spin);
            engine.after_spin = callbacks;
        });
    }
}
