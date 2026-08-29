# Worldview compiler service

Local HTTP adapter for an installed ericw-tools `qbsp -> vis -> light` pipeline. It does not vendor,
link, or distribute ericw-tools. Configure the three GPL executables explicitly:

```sh
ERICW_QBSP=/absolute/path/to/qbsp \
ERICW_VIS=/absolute/path/to/vis \
ERICW_LIGHT=/absolute/path/to/light \
npm run dev --workspace @worldview/compiler-service
```

The service listens on `127.0.0.1:8788` by default. `GET /health` reports whether executables are
configured; `GET /capabilities`, `POST /compile`, and `POST /launch` implement the safe profile-ID
protocol consumed by `RemoteMapCompiler`. Expected compiler failures return structured failed-build
results with bounded per-stage logs and any BSP, PRT, PTS, LIN, or log artifacts produced before the
failure.

The editor selects the helper in this order: its `compiler` URL query parameter,
`VITE_WORLDVIEW_COMPILER_ENDPOINT` at Vite build/dev startup, then the loopback development default.
Use the environment override when serving the editor and helper through separate trusted origins;
the helper must also include the editor origin in `WORLDVIEW_COMPILER_ORIGINS`.
Preview compiles use `qbsp -nofill`, fast vis, and bounded light work so partially constructed maps
remain inspectable. Final compiles restore outside filling, detailed vis, and extra light sampling.
Uploaded WADs and related compile assets live only in the request's temporary directory. The editor
adds WAD basenames to a transient compile copy of worldspawn; it does not modify the source document.

External launch is disabled unless all machine-local settings are present. Browser requests select
the advertised profile and build ID; they never provide a command or filesystem path:

```sh
WORLDVIEW_LAUNCH_EXECUTABLE=/absolute/path/to/quake \
WORLDVIEW_LAUNCH_WORKING_DIRECTORY=/absolute/path/to/game \
WORLDVIEW_LAUNCH_MAP_DIRECTORY=/absolute/path/to/game/id1/maps \
WORLDVIEW_LAUNCH_ARGS_JSON='["+map","%MAP%"]'
```

The helper retains the newest 20 successful in-memory builds for launch. `%MAP%` in configured
arguments is replaced with the already-validated map name. Processes are spawned without a shell.

`npm run dev` performs a fresh TypeScript build and starts the service. Restart it after changing
service source.

This is a local-development service, not an Internet-facing sandbox. Before deploying it for other
users, place each compile in a locked-down container or comparable sandbox, require authentication,
bound CPU/memory/disk independently of this process, restrict asset mounts, and keep the compiler
service off the application origin. Map compilers process untrusted input and must not inherit broad
host filesystem access.

The production Worldview image includes this adapter but not ericw-tools. Newport runs the same
image with this service's command, a read-only filesystem, bounded temporary storage, CPU/memory/PID
limits, no Linux capabilities, and the host's pinned ericw-tools directory mounted read-only. The
service is reachable only on the private Compose network; the public Worldview service proxies no
compiler route and submits its server-owned build jobs directly.
