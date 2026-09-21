// @ts-check
/**
 * Nx Release version actions for the .NET backend.
 *
 * Nx Release versions JS projects natively from package.json (via @nx/js). The backend has no
 * package.json — its version lives in the MSBuild `<Version>` property of
 * `apps/backend/Directory.Build.props`. This class teaches Nx Release to read the current version
 * from, and write the new version to, that property.
 *
 * Wired via the backend project's `release.version.versionActions` (see apps/backend/project.json)
 * with `currentVersionResolver: "disk"`. `VersionActions` is a public export of `nx/release`.
 */
const { join } = require('node:path')
const { VersionActions } = require('nx/release')

const MANIFEST = 'Directory.Build.props'
const VERSION_RE = /<Version>\s*([^<]*?)\s*<\/Version>/

class DotnetDirectoryBuildPropsVersionActions extends VersionActions {
  validManifestFilenames = [MANIFEST]

  manifestPath() {
    return join(this.projectGraphNode.data.root, MANIFEST)
  }

  // We own the .props file directly; skip the generic manifest-existence validation.
  async validate() {}

  async readCurrentVersionFromSourceManifest(tree) {
    const manifestPath = this.manifestPath()
    const content = tree.read(manifestPath, 'utf-8')
    if (!content) return null
    const match = content.match(VERSION_RE)
    if (!match) return null
    return { currentVersion: match[1].trim(), manifestPath }
  }

  // A .NET application is not published to a package registry.
  async readCurrentVersionFromRegistry() {
    return null
  }

  // The backend has no in-repo dependents whose versions are tracked in this manifest.
  async readCurrentVersionOfDependency() {
    return { currentVersion: null, dependencyCollection: null }
  }

  async updateProjectVersion(tree, newVersion) {
    const manifestPath = this.manifestPath()
    const content = tree.read(manifestPath, 'utf-8') ?? ''
    let updated
    if (VERSION_RE.test(content)) {
      updated = content.replace(VERSION_RE, `<Version>${newVersion}</Version>`)
    } else {
      // No <Version> yet: insert one into the first <PropertyGroup>.
      updated = content.replace(
        /<PropertyGroup>/,
        `<PropertyGroup>\n    <Version>${newVersion}</Version>`,
      )
    }
    tree.write(manifestPath, updated)
    return [`Updated ${MANIFEST} <Version> to ${newVersion}`]
  }

  // No manifest-based dependency version rewriting for the .NET app.
  async updateProjectDependencies() {
    return []
  }
}

module.exports = DotnetDirectoryBuildPropsVersionActions
