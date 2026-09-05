# Celld deployment simplification

Completed on Newport on 2026-09-05 after verifying Radio's production rollout. The combined
application image is live, both existing storage mounts are preserved, and the obsolete bootstrap
container is removed. See [deployment evidence and rollback details](docs/collaboration.md#newport-migration).

Worldview should adopt Radio's simpler two-service Celld deployment:

- Keep one Azurite container with its own persistent volume and health check.
- Build the Worker and Celld into one application image.
- Have that image idempotently create/check the Azurite container, run `celld diagnose`, deploy
  the current Worker, and then `exec celld` as its long-running process.
- Remove the separate `worldview-celld-bootstrap` Compose service.
- Stop publishing the `worldview-celld-deployer` image.
- Keep Azurite and Celld in separate containers because storage and runtime have distinct
  persistence, health, restart, and recovery boundaries.

Use Radio's implementation as the reference after its Azurite rollout has been verified in
production. Preserve Worldview's existing Azurite data and Celld work directory during the
migration, and explicitly remove obsolete bootstrap containers after cutover.
