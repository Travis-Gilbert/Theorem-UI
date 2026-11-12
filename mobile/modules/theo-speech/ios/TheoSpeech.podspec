# SOURCING: CocoaPods podspec for an Expo local module (the shape of modules/theo-capture's)
#
# Theo's voice: the ptts Swift package's sources and its compiled PhononCore,
# vendored sha-pinned by scripts/fetch-phonon.sh and gitignored, plus the Core
# ML Models folder the same script copies from an export made with the owner's
# voice. The package's sources compile into this pod, so the module's Swift
# uses Phonon's types without an import of its own.
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TheoSpeech'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = { :type => 'Apache-2.0' }
  s.author         = 'Theorem'
  s.homepage       = 'https://theorem.rs'
  s.platforms      = { :ios => '18.0' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '6.0'

  s.dependency 'ExpoModulesCore'
  s.source_files = ['*.swift', 'vendor/ptts/Sources/PhononTTS/*.swift']
  s.vendored_frameworks = ['vendor/PhononCore.xcframework']
  s.resources = ['vendor/Models']
  s.frameworks = %w[AVFoundation Accelerate CoreML]
end
