# Publishing

Worldview is published from a maintainer's local machine. GitHub Actions tests releases but does
not hold npm credentials or publish packages.

Prepare a version by updating the package workspace and root lockfile:

```sh
npm version minor --workspace @jackharrhy/worldview --no-git-tag-version
```

Choose `patch`, `minor`, or `major` deliberately. Releases before 1.0 use a minor bump for new
capabilities or public API changes and a patch bump for compatible fixes.

Review and commit those changes, push the release commit, and tag it. For example:

```sh
git tag v0.4.0
git push origin main v0.4.0
```

Inspect the release without contacting npm authentication:

```sh
npm run publish:dry-run
```

Publish from an interactive terminal:

```sh
npm run publish
```

The publisher opens npm's browser login when there is no active session. It then runs the repository
checks scoped to the published package, its development viewer, its consumer fixture, and the
serialized viewer browser suite. It checks the package contents, prints the package name, version,
tag, commit, and tarball sizes, and requires the exact version to be typed before publishing. The
full monorepo gate remains `npm run check`; editor, service, and collaboration builds and tests do
not gate a viewer-package release, and the viewer browser suite does not start the editor dev
server. Prereleases need an explicit tag, such as `npm run publish -- --tag next`.

Authentication stays in npm's local configuration. Do not add registry tokens to this repository.
