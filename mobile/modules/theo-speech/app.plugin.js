// SOURCING: Expo config plugin API (withXcodeProject from expo/config-plugins, SDK 58)
//
// Phonon's compiled core is arm64 only: without x86_64 excluded, an Intel
// simulator build, or any Mac target, fails to link (the ptts Swift guide).
const { withXcodeProject } = require('expo/config-plugins')

module.exports = function withPhononArchs(config) {
  return withXcodeProject(config, (config) => {
    config.modResults.updateBuildProperty(
      // Quoted: the brackets are part of the key, and an unquoted bracketed
      // key writes a pbxproj the parser cannot read back.
      '"EXCLUDED_ARCHS[sdk=iphonesimulator*]"',
      'x86_64',
    )
    return config
  })
}
