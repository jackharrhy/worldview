# Publishing

Worldview is published from a maintainer's local machine. GitHub Actions tests releases but does
not hold npm credentials or publish packages.

Prepare a version by updating the package workspace and root lockfile:

```sh
npm version patch --workspace @jackharrhy/worldview --no-git-tag-version
```

Review and commit those changes, push the release commit, and tag it. For example:

```sh
git tag v0.1.1
git push origin main v0.1.1
```

Inspect the release without contacting npm authentication:

```sh
npm run publish:dry-run
```

Publish from an interactive terminal:

```sh
npm run publish
```

The publisher opens npm's browser login when there is no active session. It then runs the full
test suite, checks the package contents, prints the package name, version, tag, commit, and tarball
sizes, and requires the exact version to be typed before publishing. Prereleases need an explicit
tag, such as `npm run publish -- --tag next`.

Authentication stays in npm's local configuration. Do not add registry tokens to this repository.
