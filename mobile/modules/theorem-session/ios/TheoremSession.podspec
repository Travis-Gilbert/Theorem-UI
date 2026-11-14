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
  # Copied into the app bundle, where Remux looks them up (Bundle.main). Its
  # Assets.xcassets is not listed: app.plugin.js merges it into the app's own
  # catalog, since a pod catalog compiles a second Assets.car that Xcode rejects.
  s.resources = [
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

  # The app imports TheoremSession (ExpoModulesProvider.swift), and with explicit
  # modules Xcode must resolve every C module behind it: the package targets that
  # Citadel, NIO and Crypto import. Xcode passes their module maps only to targets
  # that depend on the packages, which is this pod, not the app. The package
  # objects are already archived into libTheoremSession.a, so the app gets the
  # same module maps and include paths the pod gets, and links nothing twice.
  # Checkouts sit in the project's <DerivedData>/SourcePackages, which no build setting
  # names. OBJROOT is <DerivedData>/Build/Intermediates.noindex for a build and three
  # levels deeper (ArchiveIntermediates/<scheme>/IntermediateBuildFilesPath) for an
  # archive, so the app gets both include roots; the one that does not exist is ignored.
  # MODULE_CACHE_DIR is no anchor: under Xcode's default DerivedData it is the shared
  # DerivedData/ModuleCache.noindex, outside any project. The package maps are named
  # include/module.modulemap, which clang finds in an include directory by itself, so
  # only the package-generated maps (in GENERATED_MODULEMAP_DIR) are passed by file.
  # GhosttyKit and this pod have no x86_64 simulator slice, so neither does the app.
  package_includes = %w[
    swift-atomics/Sources/_AtomicsShims
    swift-nio/Sources/CNIOWindows
    swift-crypto/Sources/CCryptoBoringSSLShims
    swift-crypto/Sources/CCryptoBoringSSL
    Citadel/Sources/CCitadelBcrypt
  ]
  generated_maps = %w[CNIOAtomics CNIODarwin CNIOLinux CNIOOpenBSD CNIOPosix CNIOWASI]
  package_includes += generated_maps.map { |name| "swift-nio/Sources/#{name}" }
  checkouts = ['$(OBJROOT)/../..', '$(OBJROOT)/../../../../..'].map { |root| "#{root}/SourcePackages/checkouts" }
  swift_flags = ['$(inherited)']
  swift_flags += generated_maps.map { |name| %(-Xcc -fmodule-map-file="$(GENERATED_MODULEMAP_DIR)/#{name}.modulemap") }
  swift_flags += checkouts.product(package_includes).map { |root, dir| %(-Xcc -I"#{root}/#{dir}/include") }
  s.user_target_xcconfig = {
    'OTHER_SWIFT_FLAGS' => swift_flags.join(' '),
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
