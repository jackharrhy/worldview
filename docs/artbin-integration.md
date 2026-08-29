# Artbin integration

Artbin is Worldview's first remote asset provider. Artbin owns the approved-asset catalog, canonical
metadata, original bytes, and WAD inspection. Worldview owns project mounts, its verified
content-addressed cache, and project-specific derived resources. Browsers never receive Artbin or
machine OAuth credentials.

## Authentication and API

The Worldview backend uses a separate confidential “worldview-service” identity. It obtains a
short-lived 4orm token with the OAuth client-credentials grant and requests the
“artbin:assets:read” and “artbin:assets:content” scopes. This is distinct from the public
“worldview” client used for interactive human login.

Artbin's supported general API is:

- “GET /api/assets” for bounded search, filters, and opaque pagination;
- “GET /api/assets/:assetId” for canonical approved-asset metadata;
- “GET /api/assets/:assetId/content?sha256=<expected>” for streamed, ranged original bytes pinned
  to an expected digest; and
- “GET /api/assets/:assetId/wad” for a stable public WAD2/WAD3 directory schema.

The service caches tokens until shortly before expiry, deduplicates concurrent token requests, and
renews once after an “invalid_token” response. Deployment uses “ARTBIN_URL”,
“FOURM_SERVICE_CLIENT_ID”, “FOURM_SERVICE_CLIENT_SECRET”, and “FOURM_URL”.

## Mounts and reproducibility

A project mount records provider (“artbin”), stable asset ID, expected SHA-256, resource kind,
display name, and precedence. A move or rename does not break a mount. Missing content or a hash
conflict produces a visible broken-resource diagnostic and never substitutes the provider's latest
bytes. Worldview passes the expected hash to Artbin and independently verifies downloaded bytes
before committing them to its blob store.

Existing WADs and other supported resources mount directly. Deterministic GoldSrc WAD3 generation
from pinned loose images is Worldview project-output behavior: Worldview records ordered source
Artbin IDs and hashes, texture names, encoder version, and output hash in project provenance. A
focused encoder package should only be extracted if Artbin later has the same concrete need.

Commercial or shareware assets are never added to either repository. An operator may expose assets
they are permitted to host through Artbin, including a locally provided Half-Life WAD.

## Failure and test contract

Worldview distinguishes invalid machine authentication, insufficient scope, unavailable or
unapproved assets, changed hashes, invalid resources, and transient provider/authentication
failures. Opaque cursors are passed through unchanged. Cached resources remain usable offline by
hash.

Focused service tests cover token request containment, concurrent token deduplication, reuse and
renewal, one-time invalid-token retry, opaque query pass-through, pinned content requests, local
byte verification, hash conflicts, and WAD inspection routing. Artbin owns authorization,
visibility, streaming/range, parser mapping, and catalog contract tests at its boundary.
