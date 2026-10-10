# Plugin platform

V1 plugins declare services, dependencies, and contributions in `paseo-plugin.json` with
`manifestVersion: 1`. The daemon reads those definitions, plans their dependencies, and runs
trusted daemon providers as host services for authenticated callers. The existing plugin runtime is
documented in [plugins](plugins.md).

Two `server_info.features` flags gate the client SDK. It checks them at its boundary and reports an
unsupported host without sending a request:

| Flag                           | Capability                                                    |
| ------------------------------ | ------------------------------------------------------------- |
| `pluginPlatformDiscoveryV1`    | Catalog and dependency plans for installed v1 definitions     |
| `pluginPlatformHostServicesV1` | Resolving and calling host-scoped daemon services as a caller |

This document owns the implemented scope. The full v1 design, including the parts that are not
implemented yet, lives in the planning specification under `.dev/product-planning/`.

## Ownership

`PluginService` owns discovery alongside its existing installation lifecycle. Each query derives a
snapshot from the same built-in registry and configured sources. There is no second installation
store. Disabled sources remain visible but cannot satisfy a resolution plan.

`PluginRuntime` launches v1 packages through the same built-in and subprocess paths as other
plugins. A started v1 plugin is published to the `PlatformBroker`, which owns bindings, invocations,
and provider activations. Stopping, reloading, or a crashed process detaches only that plugin's
runtime generation.

Both source kinds use the same manifest, asset and contract checks. A built-in installation must
match its manifest ID; configured aliases may differ. A failed package produces a diagnostic entry
without hiding the other packages. Different definitions with the same public ID and API version
conflict rather than depending on load order.

The catalog revision describes the current inspected files and enablement state. Directory edits
can change it on the next query. A plan with an outdated expected revision fails explicitly. Plans
are administrative metadata and never authorize execution or hold an execution lease.

## Authoring definitions

Use `@getpaseo/plugin/v1` for schemas, inferred types, and the semantic parsers
`parsePluginPlatformManifest`, `parsePlatformService`, and `parsePlatformExtensionPoint`. Structural
schemas and wire types have one source in `packages/protocol/src/plugin-platform.ts` and
`plugin-platform-execution.ts`. Standard contribution schemas generate their JSON Schema from the
same Zod definitions.

Declare `manifestVersion: 1`, `packageId`, the v1 requirements, runtime entries, service and extension
point files, providers, consumer-owned dependencies, contributions, settings, and states. The package
manager name and exact version come from `package.json`. Empty declaration lists are explicit.

Definition parsing checks duplicate identities, references to consumers and settings, namespace
ownership, semantic versions, method policies, and state transition cycles. Permission definitions
are registered before service permission references are checked. This registration does not grant a
principal any permissions.

Permission contribution `methods` reference `serviceId.method` in a service defined or provided by
the same package. Definition scopes and identifiers are checked without creating authority to call
those methods.

Files must stay inside the package after realpath resolution. Relative schema references are loaded
from that package; arbitrary remote schema fetching is disabled. Each method input/output and event
payload is a JSON Schema root, separate from the surrounding service metadata. Literal data in
`const`, `enum`, defaults or examples does not become a file reference. Contract digests include the
transitively referenced schema documents and ignore JSON formatting.

Discovery limits each schema file to 1 MiB, each package's inspected JSON to 4 MiB and 128 files, and
dependency planning to 10,000 evaluations and 64 levels. Exceeding a limit produces a diagnostic.

## Writing a host provider

The daemon entry default-exports a registration function from `@getpaseo/plugin/v1/server`. It
registers one factory per declared provider synchronously and returns a disposer. The daemon creates
a provider on its first call, after the provider's declared dependencies are active, and disposes it
when the plugin stops:

```ts
import type { ServerPluginRegistration } from "@getpaseo/plugin/v1/server";
import { PluginPlatformError } from "@getpaseo/plugin/v1";

const register: ServerPluginRegistration = (context) => {
  context.providers.provide("files", () => ({
    methods: {
      read: async (input, invocation) => {
        const store = await invocation.services.resolveOne("store", {
          target: { kind: "service" },
          scope: invocation.scope,
        });
        if (store.status === "error") throw new PluginPlatformError(store.error);
        const result = await store.value.call("get", {
          target: { kind: "service" },
          params: input,
        });
        if (result.status === "error") throw new PluginPlatformError(result.error);
        return result.value;
      },
    },
    dispose() {},
  }));
  return () => {};
};
export default register;
```

The factory's method names must equal the service contract's methods. Handlers receive validated
input and an `InvocationContext` with the caller, scope, trace, an abort `signal`, and `services`.
Return a JSON value that matches the method's output schema. Throw `PluginPlatformError` to return a
declared failure with your own code.

`services` resolves only bindings declared in `requires` for the invoked provider. Nested calls run
with the original caller's live permissions; the plugin never receives the daemon owner session that
legacy plugins use. The SDK constrains these calls but is not a sandbox: trusted plugin code can still
use Node APIs directly.

## Host execution scope

The daemon executes this subset of the v1 contract. Installing or updating a package that needs
anything else fails with `UNSUPPORTED_FEATURE` before any configuration change or preparation
command; starting one fails with the same error:

- a trusted `index.server.ts` entry with no client entry, settings, or states;
- providers in the daemon runtime and host scope with the `drain` stop policy;
- eager dependencies consumed by providers on this host;
- `helm.auth.permission` contributions only;
- methods targeting the service, with `read` or `no-replay` retry policies, and no events,
  interceptors, or revision envelopes.

Calls follow one order: the caller owns the binding and its runtime generation is current, the
method exists, the caller holds every permission the method lists, the input matches its schema, the
provider and its dependencies are available and active, the provider runs, permissions are checked
again, and the output matches its schema. Permission arrays are AND. Plugin permissions expand to
their daemon base permissions.

| Code                      | Meaning                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `FORBIDDEN`               | The caller lacks a required permission, including a revocation during a call   |
| `STALE_BINDING`           | The binding was released, belongs to another caller, or its provider restarted |
| `INVALID_ARGUMENT`        | Unknown method, input that breaks the contract, or a deadline over the limit   |
| `PROVIDER_RESULT_INVALID` | The provider returned output that breaks the contract                          |
| `DEADLINE_EXCEEDED`       | No result within the deadline; the provider's `signal` aborts                  |
| `OUTCOME_UNKNOWN`         | A command failed after dispatch without declaring its result; do not repeat it |
| `DEPENDENCY_MISSING`      | No visible provider, or a required dependency is unavailable                   |
| `NO_EXECUTION_ROUTE`      | The request targets another host, runtime, or provider scope                   |
| `UNAUTHORIZED`            | The session has no authenticated principal                                     |

Resolution hides providers whose `inspectPermissions` the caller lacks; it reports them as missing.
`describePluginHostServices()` returns the supported runtimes, targets, retry policies, and limits.
The default deadline is 30 seconds, nested calls stop at depth 16, and each session holds at most 256
bindings.

A provider's process generation is part of every binding. Reloading creates a new generation, so old
bindings return `STALE_BINDING` and callers resolve again. Closing a session releases its bindings
and cancels its calls. Command handlers must tolerate the abort signal; the daemon never retries a
command.

## Client API

Connect a `DaemonClient`, then use these methods:

| Method                                | Result                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| `describePluginPlatform()`            | Discovery capabilities                                              |
| `getPluginPlatformCatalog()`          | Host identity, revision, installations, definitions and diagnostics |
| `planPluginPlatformResolution(input)` | Candidate provider references, dependency nodes and diagnostics     |
| `describePluginHostServices()`        | Executable runtimes, targets, retry policies and limits             |
| `resolvePluginHostService(input)`     | One binding (`mode: "one"`) or an ordered set (`mode: "many"`)      |
| `callPluginHostService(input)`        | The method output or a platform error                               |
| `releasePluginHostService(binding)`   | Releases a binding; idempotent                                      |

For example, resolve a binding and call a method:

```ts
const resolved = await client.resolvePluginHostService({
  mode: "one",
  serviceId: "acme.files",
  range: "^1.0.0",
  runtime: "daemon",
  providerScope: "host",
  scope: { kind: "host", serverId },
  target: { kind: "service" },
});
if (resolved.status === "ok" && resolved.value.mode === "one") {
  const result = await client.callPluginHostService({
    binding: resolved.value.binding.binding,
    method: "read",
    target: { kind: "service" },
    params: { path: "README.md" },
  });
}
```

Use an explicit `provider` or `selectionKey` to choose an implementation. `mode: "many"` requires a
set service and returns its declared stable ordering. Duplicate selection keys fail. An unavailable
explicit selection does not switch to another provider.

Dependencies belong to runtime, provider, or contribution nodes. A client contribution consuming a
daemon provider in its own package is not a package dependency cycle. Contextual dependencies remain
`configuring` until instance activation can supply their context. Optional missing dependencies are
reported separately. Cycles include the node path that caused the failure.

Discovery uses `plugin.platform.discovery.describe`, `.list`, and `.plan_resolution`; host services
use `plugin.platform.host.describe`, `.resolve`, `.call`, and `.release`, each with `.request` and
`.response`. Discovery requires `daemon.manage` because it inspects installation metadata. Host
service RPCs carry no fixed permission: the broker checks the selected contract's permissions
against the caller. The legacy `plugin.rpc.invoke` permission remains `daemon.manage`.

## Not implemented

V1 client entries do not run yet, so v1 plugins stay out of the legacy client catalog. There is no
card mount, configuration layering, durable operation, event subscription, window lease, Agent or MCP
caller, cross-host delegation, or marketplace publication yet. MCP's `callerAgentId` is not an
authenticated caller, so Agent tools cannot call host services until a verified Agent identity
exists.

## Validation

Coverage lives in the existing manifest and PluginService suites, the session and client transport
suites, the protocol generator suite, and the real plugin daemon integration suite. Run the changed
cases by file; follow [testing](testing.md). See [protocol validation](protocol-validation.md) for
generator ownership.
