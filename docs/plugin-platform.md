# Plugin platform

V1 plugins declare services, dependencies, and contributions in `paseo-plugin.json` with
`manifestVersion: 1`. The daemon reads those definitions, plans their dependencies, and runs
trusted daemon providers as host services for authenticated callers. The existing plugin runtime is
documented in [plugins](plugins.md).

Three `server_info.features` flags gate the client SDK. It checks them at its boundary and reports
an unsupported host without sending a request:

| Flag                            | Capability                                                    |
| ------------------------------- | ------------------------------------------------------------- |
| `pluginPlatformDiscoveryV1`     | Catalog and dependency plans for installed v1 definitions     |
| `pluginPlatformHostServicesV1`  | Resolving and calling host-scoped daemon services as a caller |
| `pluginPlatformConfigurationV1` | Reading and writing layered settings of running v1 plugins    |

This document owns the implemented scope. The full v1 design, including the parts that are not
implemented yet, lives in the planning specification under `.dev/product-planning/`.

## Ownership

`PluginService` owns discovery alongside its existing installation lifecycle. Each query derives a
snapshot from the same built-in registry and configured sources. There is no second installation
store. Disabled sources remain visible but cannot satisfy a resolution plan.

`PluginRuntime` launches v1 packages through the same built-in and subprocess paths as other
plugins and publishes each started one to the `PlatformBroker`. The broker owns sessions, bindings
and invocations. Its `ProviderLifecycle` owns the running executions and their provider nodes; see
[provider lifecycle](#provider-lifecycle). Stopping, reloading or a crashed process changes only
that plugin's providers and the providers that depend on them.

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
each provider as soon as its declared dependencies are active, and disposes it when the plugin stops
or a dependency goes away:

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

The factory's method names must equal the service contract's methods. It receives its provider
settings as `context.config`. Handlers receive validated input and an `InvocationContext` with the
caller, scope, the call's settings as `effectiveConfig`, trace, an abort `signal`, and `services`.
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

- a trusted `index.server.ts` entry with no client entry or states;
- settings at host, project and conversation scope with provider or invocation fields and no
  transitions;
- providers in the daemon runtime and host scope with the `drain` stop policy;
- eager dependencies consumed by providers on this host;
- `helm.auth.permission` contributions only;
- methods targeting the service, with `read` or `no-replay` retry policies, and no events,
  interceptors, or revision envelopes.

Calls follow one order: the caller owns the binding, the binding's provider generation is current
and admits the call, the method exists, the caller holds every permission the method lists, the
input matches its schema, the call's settings are read at its scope, the provider runs, permissions
are checked again, and the output matches its schema. Permission arrays are AND. Plugin permissions expand to their daemon base permissions.

| Code                      | Meaning                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `FORBIDDEN`               | The caller lacks a required permission, including a revocation during a call   |
| `STALE_BINDING`           | The binding was released, belongs to another caller, or its generation ended   |
| `INVALID_ARGUMENT`        | Unknown method, input that breaks the contract, or a deadline over the limit   |
| `PROVIDER_RESULT_INVALID` | The provider returned output that breaks the contract                          |
| `DEADLINE_EXCEEDED`       | No result within the deadline; the provider's `signal` aborts                  |
| `OUTCOME_UNKNOWN`         | A command failed after dispatch without declaring its result; do not repeat it |
| `DEPENDENCY_MISSING`      | No visible provider, or a required dependency is missing or not active         |
| `PLUGIN_UNAVAILABLE`      | The provider is starting, draining or failed to start, or its process exited   |
| `CONFIG_INVALID`          | A stored settings layer breaks the settings definition                         |
| `CONFIG_CONFLICT`         | The settings layer changed since the revision the write expected               |
| `RESOURCE_NOT_FOUND`      | The project, conversation or settings definition does not exist                |
| `NO_EXECUTION_ROUTE`      | The request targets another host, runtime, or provider scope                   |
| `UNAUTHORIZED`            | The session has no authenticated principal                                     |

Resolve with a `host`, `project` or `conversation` business scope on this host; every call runs on
the host provider. A conversation names its explicit project, and an independent conversation names
none. Resolution hides providers whose `inspectPermissions` the caller lacks; it reports them as
missing.
`describePluginHostServices()` returns the supported runtimes, targets, retry policies, and limits.
The default deadline is 30 seconds, nested calls stop at depth 16, and each session holds at most 256
bindings.

Closing a session releases its bindings and cancels its calls. Command handlers must tolerate the
abort signal; the daemon never retries a command.

## Provider lifecycle

Each declared provider is a node of the dependency graph, keyed by installation, provider ID and
provider scope. The lifecycle settles the nodes whenever a plugin starts, stops or exits, one change
at a time:

| State                  | Meaning                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `unresolved`           | Registered and not evaluated yet                                  |
| `pending-dependencies` | A required dependency is missing or not active; `reason` names it |
| `activating`           | Its factory is running                                            |
| `active`               | Takes calls at its current generation                             |
| `draining`             | Refuses new calls and finishes the ones it accepted               |
| `inactive`             | Its plugin is stopping                                            |
| `failed`               | Its factory or its settings failed; `reason` says which           |

A node activates as soon as its plan resolves and every dependency it plans on is active. When a
dependency stops, restarts or gets a new generation, every provider that runs against it, directly
or transitively, retires too: dependents drain and dispose first, then the dependency. Each returns
with a new generation once its dependencies are active again. Independent providers keep running.
A failed factory runs again only after its dependencies or restart-required settings change, or its
plugin restarts; the plugin keeps serving its other providers.

Stopping or reloading a plugin drains it. Its providers refuse new calls at once with
`PLUGIN_UNAVAILABLE`, finish the calls they accepted, and dispose before the process stops. A
draining provider still takes nested calls from work in flight, so its dependents can finish
against it. Every accepted call ends within its own deadline, so a drain ends within the longest
one. A process that exits ends its providers at once: in-flight calls fail with
`PLUGIN_UNAVAILABLE`, or `OUTCOME_UNKNOWN` for a dispatched command, and dependents retire.

The two generations have separate owners. `binding.generation` is the provider generation and
changes on every activation, including a rebuild after a dependency change. `execution.generation`
is the runtime generation and changes only when the process restarts. A binding whose provider
generation ended returns `STALE_BINDING`; resolve again.

`listPlugins()` reports `platformProviders` for each running v1 plugin: the state, the generation
while the provider runs, and the `reason` for pending, inactive and failed providers. The state is
an open string, so treat values you do not know as unavailable.

## Configuration

`manifest.settings` declares each setting's leaf fields as JSON Pointers into its packaged schema.
`plugins/settings/` stays the single settings owner. The v1 host layer is the same
`<settingsId>.json` document legacy plugin settings use, and the project and conversation layers sit
beside it in the installation's directory, so removing the installation removes them all.

Effective settings apply `host`, then the conversation's explicit `project`, then `conversation`.
An independent conversation has no project layer, even though a private project backs its
directory. A layer stores only its overrides: a missing field inherits, an explicit `false`
overrides, and a field holds an object or array as one value. Schema defaults apply after merging
and are never written into a layer. `writePluginConfigurationLayer` replaces a scope's whole layer,
so a field it omits inherits again. `clearPluginConfigurationOverride` removes declared fields.

Every write names the layer revision it replaces; another revision returns `CONFIG_CONFLICT` without
merging, so reload and reapply the edit. A read reports each contributing layer's revision, the
source of every field, and an `effectiveRevision` that changes whenever any of them changes. Reads
never write. A broken layer stays as written: reading returns `CONFIG_INVALID` with its scope and
revision in `details`, and writing that revision replaces it.

Fields declare where they apply:

| Application  | Received as                                                | Changes take effect                     |
| ------------ | ---------------------------------------------------------- | --------------------------------------- |
| `provider`   | `ProviderContext.config`, at the provider's lifetime scope | After the provider restarts             |
| `invocation` | `InvocationContext.effectiveConfig`, at the call's scope   | On the next call, without a new binding |

A `provider` field must be `restartRequired`, and a restart-required field is limited to the
lifetime scopes of the providers it restarts. Changing one drains every provider using those
settings and restarts it with a new generation; the write resolves after the restart and lists the
restarted providers. Invalid host settings keep their providers `failed` until a write fixes them.

## Client API

## Client API

Connect a `DaemonClient`, then use these methods:

| Method                                    | Result                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `describePluginPlatform()`                | Discovery capabilities                                               |
| `getPluginPlatformCatalog()`              | Host identity, revision, installations, definitions and diagnostics  |
| `planPluginPlatformResolution(input)`     | Candidate provider references, dependency nodes and diagnostics      |
| `describePluginHostServices()`            | Executable runtimes, targets, retry policies and limits              |
| `resolvePluginHostService(input)`         | One binding (`mode: "one"`) or an ordered set (`mode: "many"`)       |
| `callPluginHostService(input)`            | The method output or a platform error                                |
| `releasePluginHostService(binding)`       | Releases a binding; idempotent                                       |
| `readPluginConfiguration(input)`          | Effective values, provenance, layer revisions and effective revision |
| `writePluginConfigurationLayer(input)`    | The new layer revision and the providers that restarted              |
| `clearPluginConfigurationOverride(input)` | The new layer revision and the providers that restarted              |

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
use `plugin.platform.host.describe`, `.resolve`, `.call`, and `.release`; configuration uses
`plugin.platform.config.read`, `.write`, and `.clear`; each has `.request` and `.response`.
Discovery and configuration require `daemon.manage`, like legacy plugin settings. Host service RPCs
carry no fixed permission: the broker checks the selected contract's permissions against the caller.
The legacy `plugin.rpc.invoke` permission remains `daemon.manage`.

## Not implemented

V1 client entries do not run yet, so v1 plugins stay out of the legacy client catalog. There is no
card mount, durable operation, event subscription, window lease, Agent or MCP caller, cross-host
delegation, or marketplace publication yet. Configuration has no observation, settings transitions,
client scope, view fields, cross-host export, or editing for a plugin that is not running; layers of
a removed project or conversation stay until the installation is removed. MCP's `callerAgentId` is not an
authenticated caller, so Agent tools cannot call host services until a verified Agent identity
exists.

## Validation

Coverage lives in the existing manifest and PluginService suites, the session and client transport
suites, the protocol generator suite, and the real plugin daemon integration suite. Run the changed
cases by file; follow [testing](testing.md). See [protocol validation](protocol-validation.md) for
generator ownership.
