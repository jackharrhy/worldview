# Artbin integration

Artbin is Worldview's first remote asset provider. It remains the catalog and file owner;
Worldview stores project mounts and derived build resources. Browsers never receive Artbin session
cookies or integration credentials.

## Integration API

Artbin exposes a small service-authenticated API over approved assets:

- paginated search and filtering with stable file IDs, type, dimensions, size, and SHA-256;
- asset and WAD directory metadata;
- streamed original content by stable file ID; and
- deterministic WAD3 generation from an ordered selection of approved image IDs and target names.

Worldview calls this API through its same-origin backend using an environment-provided service
token. Artbin compares token digests in constant time. Ordinary Artbin browser and CLI sessions are
unchanged.

## Mounts and reproducibility

A project mount records provider (`artbin`), stable file ID, expected SHA-256, resource kind,
display name, and precedence. A move or rename does not break a mount. Missing content or a hash
mismatch produces a visible broken-resource diagnostic and never substitutes the provider's latest
bytes.

Existing WADs, palettes, entity definitions, and sprites mount directly. For loose textures,
Artbin performs bounded image validation and deterministic GoldSrc WAD3 encoding; Worldview stores
the returned WAD in its content-addressed blob store together with ordered source IDs, source
hashes, texture names, encoder version, and output hash. Rebuilding identical inputs produces the
same bytes.

Commercial or shareware assets are never added to either repository. An operator may expose assets
they are permitted to host through Artbin, including a locally provided Half-Life WAD.

## Failure and test contract

The proxy distinguishes provider unavailable, unauthorized, missing, changed, and invalid-resource
states. Existing cached resources remain usable offline by hash. Integration tests cover service
authentication, approved-only visibility, pagination, streaming limits, hash drift, WAD inspection,
deterministic pack output, and Worldview compile resolution.
