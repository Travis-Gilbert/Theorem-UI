# SOURCING: CocoaPods podspec for an Expo local module; React Native's spm_dependency helper (react_native_pods.rb) for Swift packages
#
# Compiles the vendored Remux sources (vendor/remux, MIT) with the Theorem
# module files. Remux's own @main app entry is left out; everything else is
# compiled as Remux built it. GhosttyKit is the pinned prebuilt release that
# scripts/fetch-ghosttykit.sh downloads and verifies before `pod install`.
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TheoremSession'
  s.version        = package['version']
  s.summary        = package['description']
  # Theorem's files follow the repository's Apache-2.0 license; vendor/remux is MIT.
  s.license        = { :type => 'Apache-2.0 AND MIT', :file => 'vendor/remux/LICENSE' }
  s.author         = 'Theorem'
  s.homepage       = 'https://theorem.rs'
  s.platforms      = { :ios => '18.0' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '6.0'

  s.dependency 'ExpoModulesCore'

  s.source_files = ['*.swift', 'vendor/remux/Sources/**/*.swift']
  s.exclude_files = ['vendor/remux/Sources/App/RemuxApp.swift']
  # Copied into the app bundle, where Remux looks them up (Bundle.main, Image(named:)).
  s.resources = [
    'vendor/remux/Assets.xcassets',
    'vendor/remux/Resources/install_authorized_key.sh',
    'vendor/remux/Resources/ThirdPartyNotices.txt',
  ]
  s.resource_bundles = { 'TheoremSessionPrivacy' => ['vendor/remux/PrivacyInfo.xcprivacy'] }

  s.vendored_frameworks = 'Frameworks/GhosttyKit.xcframework'
  s.libraries = 'c++'
  # What libghostty-internal.a references (llvm-nm -u on the pinned ios-arm64 slice).
  s.frameworks = %w[Metal QuartzCore CoreText CoreGraphics CoreFoundation IOSurface]

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'x86_64',
  }

  unless File.exist?(File.join(__dir__, 'Frameworks', 'GhosttyKit.xcframework'))
    raise 'TheoremSession: GhosttyKit.xcframework is missing. Run modules/theorem-session/scripts/fetch-ghosttykit.sh first.'
  end

  unless respond_to?(:spm_dependency, true)
    raise 'TheoremSession: spm_dependency is unavailable; it comes from react-native/scripts/react_native_pods.rb, which the Expo Podfile loads.'
  end

  # Remux's resolved revisions (Remux.xcodeproj Package.resolved at the vendored commit)
  # for the packages its sources import directly.
  spm_dependency(s,
    url: 'https://github.com/h3nock/Citadel.git',
    requirement: { kind: 'revision', revision: '5089c5e1952a829f4bc02354d74d5ceefd7af254' },
    products: ['Citadel'])
  spm_dependency(s,
    url: 'https://github.com/apple/swift-nio.git',
    requirement: { kind: 'revision', revision: 'cd6710454f25733900e133c6caf5188952763c36' },
    products: ['NIO', 'NIOCore', 'NIOPosix', 'NIOConcurrencyHelpers'])
  spm_dependency(s,
    url: 'https://github.com/h3nock/swift-nio-ssh.git',
    requirement: { kind: 'revision', revision: '14e451a88db83c68d5113c380dc5b79ddc0ba7f3' },
    products: ['NIOSSH'])
  spm_dependency(s,
    url: 'https://github.com/apple/swift-crypto.git',
    requirement: { kind: 'revision', revision: '95ba0316a9b733e92bb6b071255ff46263bbe7dc' },
    products: ['Crypto'])
end
