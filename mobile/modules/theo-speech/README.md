# theo-speech

Theo's own voice on the phone. The native module wraps the `ptts` Swift
package (MIT OR Apache-2.0) and its compiled `PhononCore`, both vendored by
`scripts/fetch-phonon.sh` at the sha-pinned release v0.7.0, and a Core ML
`Models` folder exported with the owner's voice (`theo.safetensors`) and the
picked pace (`duration_delta=-0.05`) fixed in it, as the Core ML export
requires. `PhononPlayer` streams 24 kHz audio as it is generated; `stop`
cancels the saying and stops what is scheduled.

`vendor/` is gitignored and fetched: the compiled core and the Swift sources
by sha, the Models folder by export on a machine with Rust and the voice
file (the script says the command). EAS runs the fetch in
`eas-build-pre-install`; the Models step there needs the exported folder
cached or hosted, which is an owner decision.

The compiled core is arm64 only, so `app.plugin.js` excludes `x86_64` from
the app target's simulator builds, as the ptts Swift guide asks.

Before a local `xcodebuild`: Expo SDK 58's prebuild writes a pbxproj whose
sharing-extension and widget groups share one `Info.plist` file reference,
which Xcode refuses to open (reproduced on pristine main, so it is not this
module). Patch the generated project — give the second group its own
reference — or build through EAS, which generates its own.
