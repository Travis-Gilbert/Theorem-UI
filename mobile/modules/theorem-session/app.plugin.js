// SOURCING: Expo config plugin API (withDangerousMod from expo/config-plugins, SDK 58)
//
// Remux looks its images up by name in the main bundle: Image("AgentGlyph-<id>"),
// Image("SessionBackendTmux"), Image("ShortcutClaudeMark"). Shipped through the
// pod's `resources`, its asset catalog compiles into a second Assets.car beside the
// app's own, and Xcode stops with "Multiple commands produce .../Assets.car". At
// prebuild this plugin copies Remux's image sets into the app's Images.xcassets
// instead, so the app target compiles one catalog and the names still resolve.
const fs = require('node:fs')
const path = require('node:path')
const { withDangerousMod } = require('expo/config-plugins')

const remuxAssets = path.join(__dirname, 'ios', 'vendor', 'remux', 'Assets.xcassets')

module.exports = function withRemuxAssets(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const { platformProjectRoot, projectName } = config.modRequest
      const catalog = path.join(platformProjectRoot, projectName, 'Images.xcassets')
      fs.mkdirSync(catalog, { recursive: true })
      for (const entry of fs.readdirSync(remuxAssets, { withFileTypes: true })) {
        // The catalog's own Contents.json stays the app's.
        if (!entry.isDirectory()) continue
        const destination = path.join(catalog, entry.name)
        fs.rmSync(destination, { recursive: true, force: true })
        fs.cpSync(path.join(remuxAssets, entry.name), destination, { recursive: true })
      }
      return config
    },
  ])
}
