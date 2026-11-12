// SOURCING: expo/metro-config getDefaultConfig (SDK 58), Metro `watchFolders` and `resolver.nodeModulesPaths`
//
// Theo's core is not copied into the app. It is the web client's own source at
// the repository root (src/lib/face, with the liveness type it reads from
// src/lib/kit), and the app's one door to it is src/features/theo/core.ts.
// Metro only reads files under the project root unless told about others.
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const root = path.resolve(__dirname, '..')

config.watchFolders = [path.join(root, 'src/lib/face'), path.join(root, 'src/lib/kit')]
// Those files import nothing from node_modules; if one ever does, it resolves from the app's.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]

module.exports = config
