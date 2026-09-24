---
name: Generated client DOM typings
description: The generated API client uses Headers.entries(), so its TypeScript lib set must include dom.iterable.
---

The shared generated React client requires `dom.iterable` in its TypeScript `lib` configuration because Orval's fetch helper calls `Headers.entries()`.

**Why:** Without it, API code generation succeeds but the workspace library typecheck fails on the generated file.

**How to apply:** Keep `dom`, `dom.iterable`, and the target ES lib together in `lib/api-client-react/tsconfig.json` when regenerating the client.