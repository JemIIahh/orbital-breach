The `ws` directory contains the ws 8.19.0 JavaScript runtime from the locally
installed package, used under its MIT license (ws/LICENSE). Upstream:
https://github.com/websockets/ws

The upstream development scripts/dependencies were omitted from its package.json;
the runtime and optional native peer metadata are unchanged. The app declares it
as a file dependency. This avoids a registry download in the restricted workspace.
