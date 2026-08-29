# Final Artbin integration contract for Worldview

Artbin has implemented the general machine asset API requested by Worldview. This is the single consumer-facing handoff; Worldview does not need to combine it with earlier 4orm or Artbin planning notes.

## What changed

The experimental `/api/worldview/*` routes and `ARTBIN_WORLDVIEW_TOKEN` are gone without compatibility aliases. Artbin now exposes:

```text
GET /api/assets
GET /api/assets/:assetId
GET /api/assets/:assetId/content?sha256=<expected>
GET /api/assets/:assetId/wad
```

Artbin is the authority for approved asset metadata and original bytes. Worldview should keep caching verified bytes in its blob store and pin every project mount by both stable Artbin asset ID and expected SHA-256.

## Machine authentication

The Worldview backend obtains a 4orm token with its confidential `worldview-service` client:

```http
POST https://4orm.harrhy.xyz/oauth/token
Authorization: Basic base64(worldview-service:<secret>)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&scope=artbin%3Aassets%3Aread+artbin%3Aassets%3Acontent
```

Tokens live for 600 seconds and do not have refresh tokens. Cache and renew them in `apps/worldview-service`; never return the client secret or access token to editor JavaScript.

Use these Worldview server environment names:

```text
ARTBIN_URL=https://artbin.jackharrhy.dev
ARTBIN_OAUTH_CLIENT_ID=worldview-service
ARTBIN_OAUTH_CLIENT_SECRET=<generated once in 4orm admin>
FOURM_URL=https://4orm.harrhy.xyz
```

Derive the token URL as `${FOURM_URL}/oauth/token`. Keep the existing public `FOURM_CLIENT_ID=worldview` for interactive human login; it is a separate identity and must not receive the machine secret.

Send the token to Artbin as `Authorization: Bearer <opaque-access-token>`.

Scopes:

- `artbin:assets:read` — catalog, canonical metadata, and WAD inspection;
- `artbin:assets:content` — original content.

There is no separate WAD-inspection scope.

## Catalog

```http
GET /api/assets?q=brick&kind=texture&folderId=<id>&tag=classic&limit=30&cursor=<opaque>
```

All parameters are optional. `limit` defaults to 30 and is capped at 100. `kind` accepts `texture`, `model`, `audio`, `map`, `archive`, `config`, or `other`. `folderId` is exact and `tag` is an exact slug. Results are newest first; pass `nextCursor` back unchanged.

```json
{
  "assets": [
    {
      "id": "stable-artbin-id",
      "name": "halflife.wad",
      "path": "_provided/goldsrc/halflife.wad",
      "kind": "archive",
      "mimeType": "application/x-wad",
      "size": 123456,
      "sha256": "64-character-lowercase-hex",
      "width": null,
      "height": null,
      "folder": { "id": "...", "name": "GoldSrc", "slug": "_provided/goldsrc" },
      "tags": [{ "id": "...", "name": "Classic", "slug": "classic" }]
    }
  ],
  "nextCursor": null
}
```

Only approved assets with valid hashes are exposed.

## Metadata

`GET /api/assets/:assetId` returns `{ "asset": <canonical asset> }`. Missing, pending, rejected, and unhashed records all return `404 asset_not_found`.

## Content and integrity

```http
GET /api/assets/:assetId/content?sha256=<expected-lowercase-hex>
```

The expected digest is mandatory. Artbin streams the original and supports single ranges, conditional requests, and strong ETags. Successful responses include:

```text
ETag: "<sha256>"
Digest: sha-256=<base64-digest>
X-Artbin-Asset-Id: <asset-id>
X-Artbin-SHA256: <hex-digest>
Accept-Ranges: bytes
```

If the record is still approved but its bytes changed, Artbin returns `409 asset_hash_changed` with `expectedSha256` and `currentSha256`. Do not silently substitute the new bytes. Fetch metadata and require the project/user flow to accept the new digest. Continue verifying downloaded bytes before committing them to Worldview's blob store.

## WAD inspection

`GET /api/assets/:assetId/wad` uses `artbin:assets:read` and is bounded to 256 MiB:

```json
{
  "asset": {},
  "wad": {
    "version": "WAD3",
    "lumpCount": 1,
    "textures": [
      {
        "index": 0,
        "name": "BRICK",
        "width": 64,
        "height": 64,
        "transparent": false
      }
    ]
  }
}
```

This is Artbin's supported public mapping, independent of its internal parser shape.

## Errors and retry behavior

Errors use `{ "error": { "code", "message", "details"? } }`.

- `400 invalid_request` or `invalid_cursor`: fix the request.
- `401 invalid_token`: renew the 4orm token once, then fail if still rejected.
- `403 insufficient_scope`: machine-client configuration error.
- `404 asset_not_found`: source is unavailable or no longer approved.
- `409 asset_hash_changed`: explicit source revision change.
- `413 asset_too_large`: WAD is above the inspection bound.
- `422 unsupported_asset` or `invalid_wad`: do not retry unchanged.
- `503 authentication_unavailable` or `asset_unavailable`: transient; honor `Retry-After` and use bounded exponential backoff.

There is currently no Artbin application-level rate limiter. Avoid duplicate parallel downloads and reuse machine tokens until shortly before expiry.

## WAD creation

Artbin does not create WADs. Worldview should own project-specific deterministic WAD generation and record source Artbin IDs/hashes in project provenance. If another real consumer later needs the same encoder, extract a focused shared package with deterministic fixtures.

## Worldview migration checklist

1. Replace fixed-token `ArtbinConfig` with Artbin URL, 4orm URL, machine client ID, and machine client secret.
2. Add a server-only client-credentials token provider with in-flight request deduplication and renewal shortly before expiry.
3. Migrate search, metadata, content, and WAD inspection to the routes above.
4. Pass the mounted digest on every content request and keep local SHA-256 verification.
5. Handle opaque pagination and documented error codes explicitly.
6. Remove `ARTBIN_WORLDVIEW_TOKEN` completely.
7. Test token reuse/renewal, secret containment, pagination, changed hashes, byte verification, WAD mapping, and transient failures.

## Rollout order

1. Generate `artbin-server` credentials in 4orm, configure Artbin, and deploy it.
2. Verify an authenticated catalog and ranged-content request.
3. Generate the separate `worldview-service` secret in 4orm.
4. Configure the Worldview backend and deploy its migrated client.
5. Finish any overlapping secret rotation only after verification.

Artbin's implementation is covered by focused service-route tests plus its complete unit, Remix-router, typecheck, lint, formatting, and isolated browser verification suites.
