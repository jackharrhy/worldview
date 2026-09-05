# Celld deployment simplification

Worldview follows Radio's maintained Celld fork with a single SQLite-backed collaboration
container. The image prepares its Worker and then execs Celld; Azurite and the old bootstrap
service are no longer required. The web/compiler service remains separate.

Use the ordinary `:latest` image workflow. Keep authoritative objects at
`/var/lib/celld/object-store/objects.sqlite3` and disposable replicas at
`/var/lib/celld/state-sqlite` on the existing Celld volume. Preserve consistent pre-migration
backups and verify existing maps before resuming writes. See the brief
[deployment notes](docs/collaboration.md#newport-migration).
