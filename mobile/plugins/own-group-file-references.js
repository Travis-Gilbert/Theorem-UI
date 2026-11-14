// SOURCING: the fix merged upstream as expo/expo#53205 (expo-sharing) and #53206 (expo-widgets)
// for expo/expo#52987, ported here because no SDK 58 release carries it yet (expo-sharing 58.0.23
// and expo-widgets 58.0.28 still reuse the reference). Remove this plugin once both packages ship it.
//
// The xcode package's addPbxGroup reuses any file reference that has the same path, also one that
// already sits in another target's group. expo-sharing and expo-widgets each add a group-relative
// Info.plist, so the second one takes the first one's reference. Xcode 27.2 refuses that project:
// "The reference "Info.plist" is a member of more than one group, which is not allowed."
// After every other mod has run, each group that lists a file reference another group already
// lists gets its own copy of it, with a new UUID.
const { withXcodeProject } = require('expo/config-plugins')

module.exports = function withOwnGroupFileReferences(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults
    const { PBXGroup: groups, PBXFileReference: fileReferences } = project.hash.project.objects
    const listed = new Set()
    // The sections also hold a `<uuid>_comment` string per entry; only the objects are groups.
    for (const group of Object.values(groups).filter((value) => typeof value === 'object')) {
      for (const child of group.children) {
        const fileReference = fileReferences[child.value]
        if (fileReference && listed.has(child.value)) {
          const uuid = project.generateUuid()
          fileReferences[uuid] = { ...fileReference }
          const comment = fileReferences[`${child.value}_comment`]
          if (comment) fileReferences[`${uuid}_comment`] = comment
          child.value = uuid
        }
        listed.add(child.value)
      }
    }
    return config
  })
}
