# SOURCING: CocoaPods podspec for an Expo local module (the shape of modules/theorem-session's)
#
# The screen-sharing prototype. ScreenCaptureKit is weak-linked: it exists for
# iOS only from the iOS 27 SDK, and the Swift compiles its route out when the
# SDK has none (`#if canImport(ScreenCaptureKit)`).
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TheoCapture'
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
  s.source_files = ['*.swift']
  s.frameworks = %w[AVFoundation CoreImage CoreMedia CoreVideo]
  s.weak_frameworks = %w[ScreenCaptureKit]
end
