# Vendored Remux

| Field | Value |
| --- | --- |
| Upstream | https://github.com/h3nock/remux |
| Revision | `3646b2fff2ffbfe75b05e2683481160a886b6a6e` (2026-11-05) |
| License | MIT, `LICENSE` in this directory; third-party notices in `Resources/ThirdPartyNotices.txt` |
| Copied | 2026-11-08 |

## What was copied

Byte-for-byte copies from the upstream revision:

- `RemuxApp/Sources/**` → `Sources/`
- `RemuxApp/Assets.xcassets` → `Assets.xcassets`
- `RemuxApp/PrivacyInfo.xcprivacy` → `PrivacyInfo.xcprivacy`
- `RemuxApp/Resources/install_authorized_key.sh` and `ThirdPartyNotices.txt` → `Resources/`
- `LICENSE` and `docs/architecture.md`

Not copied: the Xcode project and `project.yml`, the app icon (`Remux.icon`,
`IconComposerLayers`), `Info.plist`, tests, UI tests, the website and the
release scripts. No upstream file has been edited; Theorem code lives one
directory up (`ios/*.swift`).

## How it is built

`../../TheoremSession.podspec` compiles every file under `Sources/` except
`Sources/App/RemuxApp.swift`, the upstream `@main` app entry. Its GhosttyKit
release-mode check is applied by `TheoremSessionModule.swift` instead.

| Dependency | Pin | Source |
| --- | --- | --- |
| GhosttyKit.xcframework | release `ghosttykit-20261104`, archive SHA-256 `5f4e70713b9a55e07bba40754bd72e4b453467cacc20814a9d915c65934db957` | h3nock/remux-ghostty, installed by `scripts/fetch-ghosttykit.sh` |
| Citadel | revision `5089c5e1952a829f4bc02354d74d5ceefd7af254` | upstream `project.yml` |
| swift-nio | revision `cd6710454f25733900e133c6caf5188952763c36` (2.98.0) | upstream Package.resolved |
| swift-nio-ssh (h3nock fork) | revision `14e451a88db83c68d5113c380dc5b79ddc0ba7f3` | upstream Package.resolved |
| swift-crypto | revision `95ba0316a9b733e92bb6b071255ff46263bbe7dc` (3.15.1) | upstream Package.resolved |

The remaining transitive packages (BigInt, swift-asn1, swift-atomics,
swift-collections, swift-log, swift-system) resolve within Citadel's declared
ranges when CocoaPods generates the project, so they can differ from the
upstream Package.resolved. The generated `ios/` directory is not committed.

## Updating

Copy the same paths from a new upstream revision, update the revision here and
in `TheoremSessionModule.swift` (`RemuxProvenance`), take the GhosttyKit
release and checksum from upstream `scripts/fetch_ghosttykit.sh`, and the
package pins from upstream `project.yml` and Package.resolved.
