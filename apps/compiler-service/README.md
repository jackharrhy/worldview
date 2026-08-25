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
configured; `POST /compile` implements the JSON protocol consumed by `RemoteMapCompiler`.
Preview compiles use `qbsp -nofill`, fast vis, and bounded light work so partially constructed maps
remain inspectable. Final compiles restore outside filling, detailed vis, and extra light sampling.
Uploaded WADs and related compile assets live only in the request's temporary directory. The editor
adds WAD basenames to a transient compile copy of worldspawn; it does not modify the source document.

`npm run dev` performs a fresh TypeScript build and starts the service. Restart it after changing
service source.

This is a local-development service, not an Internet-facing sandbox. Before deploying it for other
users, place each compile in a locked-down container or comparable sandbox, require authentication,
bound CPU/memory/disk independently of this process, restrict asset mounts, and keep the compiler
service off the application origin. Map compilers process untrusted input and must not inherit broad
host filesystem access.
