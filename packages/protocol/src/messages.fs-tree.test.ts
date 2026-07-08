import { describe, expect, test } from "vitest";

import {
  FileExplorerResponseSchema,
  FsCopyRequestSchema,
  FsCopyResponseSchema,
  FsCreateRequestSchema,
  FsCreateResponseSchema,
  FsDeleteRequestSchema,
  FsDeleteResponseSchema,
  FsMkdirRequestSchema,
  FsMkdirResponseSchema,
  FsMoveRequestSchema,
  FsMoveResponseSchema,
  FsRenameRequestSchema,
  FsRenameResponseSchema,
  FsSearchProgressSchema,
  FsSearchRequestSchema,
  FsSearchResponseSchema,
  FsWriteFileRequestSchema,
  FsWriteFileResponseSchema,
  ServerInfoStatusPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";

// Capability gates: the new fsSearch/fsWrite flags must parse when present and stay
// absent for old daemons (backward compat — features object is optional all the way down).
describe("file-tree capability gates", () => {
  test("parses server_info with fsSearch and fsWrite enabled", () => {
    const parsed = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "srv-1",
      features: { fsSearch: true, fsWrite: true },
    });
    expect(parsed.features).toMatchObject({ fsSearch: true, fsWrite: true });
  });

  test("keeps fsSearch/fsWrite absent for an old daemon that never sends them", () => {
    const parsed = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "srv-1",
      features: { providersSnapshot: true },
    });
    expect(parsed.features?.fsSearch).toBeUndefined();
    expect(parsed.features?.fsWrite).toBeUndefined();
  });

  test("parses server_info with fsWriteFile enabled (content-write capability)", () => {
    const parsed = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "srv-1",
      features: { fsWrite: true, fsWriteFile: true },
    });
    expect(parsed.features).toMatchObject({ fsWrite: true, fsWriteFile: true });
  });

  test("keeps fsWriteFile absent for an old daemon that gates structure writes but not content writes", () => {
    // Critical backward-compat: an old daemon may broadcast fsWrite:true (structure writes) yet have no
    // content-write handler. fsWriteFile MUST stay undefined so a new client never sends fs.write to it.
    const parsed = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "srv-1",
      features: { fsWrite: true },
    });
    expect(parsed.features?.fsWrite).toBe(true);
    expect(parsed.features?.fsWriteFile).toBeUndefined();
  });
});

// Content search RPC: request carries the search intent, response carries matches.
// Optional match fields (line/preview/ranges) and basePath/limit stay absent on old messages.
describe("fs.search RPC schema", () => {
  test("parses a content-search request with all optionals omitted", () => {
    const parsed = FsSearchRequestSchema.parse({
      type: "fs.search.request",
      root: "/repo",
      query: "needle",
      mode: "content",
      requestId: "req-1",
    });
    expect(parsed).toEqual({
      type: "fs.search.request",
      root: "/repo",
      query: "needle",
      mode: "content",
      requestId: "req-1",
    });
  });

  test("parses a request with basePath and limit", () => {
    const parsed = FsSearchRequestSchema.parse({
      type: "fs.search.request",
      root: "/repo",
      query: "needle",
      mode: "name",
      basePath: "src",
      limit: 50,
      requestId: "req-1",
    });
    expect(parsed.basePath).toBe("src");
    expect(parsed.limit).toBe(50);
  });

  test("parses a content-search response with full match metadata", () => {
    const parsed = FsSearchResponseSchema.parse({
      type: "fs.search.response",
      payload: {
        requestId: "req-1",
        matches: [
          {
            path: "src/app.ts",
            kind: "file",
            line: 12,
            preview: "const needle = 1;",
            ranges: [{ start: 6, end: 12 }],
          },
        ],
        truncated: true,
      },
    });
    expect(parsed.payload.matches[0]).toMatchObject({
      path: "src/app.ts",
      kind: "file",
      line: 12,
    });
    expect(parsed.payload.truncated).toBe(true);
  });

  test("parses a response whose matches omit the optional content fields", () => {
    const parsed = FsSearchResponseSchema.parse({
      type: "fs.search.response",
      payload: {
        requestId: "req-1",
        matches: [{ path: "src", kind: "directory" }],
        truncated: false,
      },
    });
    expect(parsed.payload.matches[0]).toEqual({ path: "src", kind: "directory" });
  });

  test("registers fs.search.request on the inbound union and response on the outbound union", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "fs.search.request",
        root: "/repo",
        query: "needle",
        mode: "content",
        requestId: "req-1",
      }).type,
    ).toBe("fs.search.request");
    expect(
      SessionOutboundMessageSchema.parse({
        type: "fs.search.response",
        payload: { requestId: "req-1", matches: [], truncated: false },
      }).type,
    ).toBe("fs.search.response");
  });

  test("parses the optional progressive opt-in flag and stays absent for old clients", () => {
    const progressive = FsSearchRequestSchema.parse({
      type: "fs.search.request",
      root: "/repo",
      query: "needle",
      mode: "content",
      progressive: true,
      requestId: "req-1",
    });
    expect(progressive.progressive).toBe(true);

    const plain = FsSearchRequestSchema.parse({
      type: "fs.search.request",
      root: "/repo",
      query: "needle",
      mode: "name",
      requestId: "req-2",
    });
    expect(plain.progressive).toBeUndefined();
  });

  test("parses fs.search.progress batches and registers them on the outbound union", () => {
    const parsed = FsSearchProgressSchema.parse({
      type: "fs.search.progress",
      payload: {
        requestId: "req-1",
        matches: [{ path: "src/a.ts", kind: "file", line: 3, preview: "needle" }],
      },
    });
    expect(parsed.payload.matches[0]).toMatchObject({ path: "src/a.ts", kind: "file" });
    expect(
      SessionOutboundMessageSchema.parse({
        type: "fs.search.progress",
        payload: { requestId: "req-1", matches: [] },
      }).type,
    ).toBe("fs.search.progress");
  });
});

// FS write RPCs: five create/structure operations, each echoing a normalized absolute path.
describe("fs write RPC schemas", () => {
  test("parses fs.create request and response", () => {
    expect(
      FsCreateRequestSchema.parse({
        type: "fs.create.request",
        root: "/repo",
        path: "src/new.ts",
        requestId: "req-1",
      }),
    ).toMatchObject({ type: "fs.create.request", path: "src/new.ts" });
    expect(
      FsCreateResponseSchema.parse({
        type: "fs.create.response",
        payload: { requestId: "req-1", path: "src/new.ts" },
      }).payload.path,
    ).toBe("src/new.ts");
  });

  test("parses fs.mkdir request and response", () => {
    expect(
      FsMkdirRequestSchema.parse({
        type: "fs.mkdir.request",
        root: "/repo",
        path: "src/dir",
        requestId: "req-1",
      }),
    ).toMatchObject({ type: "fs.mkdir.request", path: "src/dir" });
    expect(
      FsMkdirResponseSchema.parse({
        type: "fs.mkdir.response",
        payload: { requestId: "req-1", path: "src/dir" },
      }).payload.path,
    ).toBe("src/dir");
  });

  test("parses fs.rename request and response", () => {
    expect(
      FsRenameRequestSchema.parse({
        type: "fs.rename.request",
        root: "/repo",
        path: "src/old.ts",
        newName: "new.ts",
        requestId: "req-1",
      }),
    ).toMatchObject({ type: "fs.rename.request", newName: "new.ts" });
    expect(
      FsRenameResponseSchema.parse({
        type: "fs.rename.response",
        payload: { requestId: "req-1", path: "src/new.ts" },
      }).payload.path,
    ).toBe("src/new.ts");
  });

  test("parses fs.move request and response", () => {
    expect(
      FsMoveRequestSchema.parse({
        type: "fs.move.request",
        root: "/repo",
        from: "src/a.ts",
        toDir: "lib",
        requestId: "req-1",
      }),
    ).toMatchObject({ type: "fs.move.request", from: "src/a.ts", toDir: "lib" });
    expect(
      FsMoveResponseSchema.parse({
        type: "fs.move.response",
        payload: { requestId: "req-1", path: "lib/a.ts" },
      }).payload.path,
    ).toBe("lib/a.ts");
  });

  test("parses fs.copy request and response", () => {
    expect(
      FsCopyRequestSchema.parse({
        type: "fs.copy.request",
        root: "/repo",
        from: "src/a.ts",
        toDir: "lib",
        requestId: "req-1",
      }),
    ).toMatchObject({ type: "fs.copy.request", from: "src/a.ts", toDir: "lib" });
    expect(
      FsCopyResponseSchema.parse({
        type: "fs.copy.response",
        payload: { requestId: "req-1", path: "lib/a.ts" },
      }).payload.path,
    ).toBe("lib/a.ts");
  });

  test("registers all five write requests on the inbound union", () => {
    for (const message of [
      { type: "fs.create.request", root: "/r", path: "a", requestId: "1" },
      { type: "fs.mkdir.request", root: "/r", path: "a", requestId: "1" },
      { type: "fs.rename.request", root: "/r", path: "a", newName: "b", requestId: "1" },
      { type: "fs.move.request", root: "/r", from: "a", toDir: "b", requestId: "1" },
      { type: "fs.copy.request", root: "/r", from: "a", toDir: "b", requestId: "1" },
    ]) {
      expect(SessionInboundMessageSchema.parse(message).type).toBe(message.type);
    }
  });

  test("registers all five write responses on the outbound union", () => {
    for (const type of [
      "fs.create.response",
      "fs.mkdir.response",
      "fs.rename.response",
      "fs.move.response",
      "fs.copy.response",
    ]) {
      expect(
        SessionOutboundMessageSchema.parse({
          type,
          payload: { requestId: "1", path: "a" },
        }).type,
      ).toBe(type);
    }
  });
});

// fs.delete RPC: a structure write that removes a file or recursively removes a directory. It shares
// the fsWrite capability gate (no new flag); its request/response mirror the other write RPCs.
describe("fs.delete RPC schema", () => {
  test("parses an fs.delete request scoped to root + path", () => {
    expect(
      FsDeleteRequestSchema.parse({
        type: "fs.delete.request",
        root: "/repo",
        path: "src/old.ts",
        requestId: "req-1",
      }),
    ).toMatchObject({ type: "fs.delete.request", root: "/repo", path: "src/old.ts" });
  });

  test("parses an fs.delete response echoing the removed path", () => {
    expect(
      FsDeleteResponseSchema.parse({
        type: "fs.delete.response",
        payload: { requestId: "req-1", path: "src/old.ts" },
      }).payload.path,
    ).toBe("src/old.ts");
  });

  test("registers fs.delete.request on the inbound union and response on the outbound union", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "fs.delete.request",
        root: "/repo",
        path: "a",
        requestId: "1",
      }).type,
    ).toBe("fs.delete.request");
    expect(
      SessionOutboundMessageSchema.parse({
        type: "fs.delete.response",
        payload: { requestId: "1", path: "a" },
      }).type,
    ).toBe("fs.delete.response");
  });
});

// fs.write RPC: writes file CONTENT back to disk (autosave-on-blur), carrying the mtime read when the
// file was opened so the host can guard against blind-overwriting an external change. Gated by
// features.fsWriteFile (NOT fsWrite — that gates structure writes). The response payload sets exactly
// one of `modifiedAt` (the write landed) or `conflict` (host refused); denied/unavailable are rpc_error.
describe("fs.write RPC schema", () => {
  test("parses an fs.write request carrying content + expected mtime", () => {
    expect(
      FsWriteFileRequestSchema.parse({
        type: "fs.write.request",
        root: "/repo",
        path: "src/doc.md",
        content: "# hello",
        expectedModifiedAt: "2026-07-07T00:00:00.000Z",
        requestId: "req-1",
      }),
    ).toMatchObject({ type: "fs.write.request", path: "src/doc.md", content: "# hello" });
  });

  test("parses an fs.write response for a landed write (modifiedAt set, conflict absent)", () => {
    const parsed = FsWriteFileResponseSchema.parse({
      type: "fs.write.response",
      payload: { requestId: "req-1", path: "src/doc.md", modifiedAt: "2026-07-07T00:00:01.000Z" },
    });
    expect(parsed.payload.modifiedAt).toBe("2026-07-07T00:00:01.000Z");
    expect(parsed.payload.conflict).toBeUndefined();
  });

  test("parses an fs.write response for a conflict (hostModifiedAt set, modifiedAt absent)", () => {
    const parsed = FsWriteFileResponseSchema.parse({
      type: "fs.write.response",
      payload: {
        requestId: "req-1",
        path: "src/doc.md",
        conflict: { hostModifiedAt: "2026-07-07T09:09:09.000Z" },
      },
    });
    expect(parsed.payload.conflict?.hostModifiedAt).toBe("2026-07-07T09:09:09.000Z");
    expect(parsed.payload.modifiedAt).toBeUndefined();
  });

  test("registers fs.write.request on the inbound union and response on the outbound union", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "fs.write.request",
        root: "/repo",
        path: "a.md",
        content: "x",
        expectedModifiedAt: "2026-07-07T00:00:00.000Z",
        requestId: "1",
      }).type,
    ).toBe("fs.write.request");
    expect(
      SessionOutboundMessageSchema.parse({
        type: "fs.write.response",
        payload: { requestId: "1", path: "a.md", modifiedAt: "2026-07-07T00:00:01.000Z" },
      }).type,
    ).toBe("fs.write.response");
  });
});

// Directory listings carry the host-resolved absolute directory path as an additive optional field, so
// the client can build "~"-free absolute paths (reveal / copy-path) without guessing os.homedir. Old
// daemons that never send it must still parse (backward compat — absolutePath stays undefined).
describe("file_explorer_response absolute directory path", () => {
  test("parses a list response carrying the absolute directory path", () => {
    const parsed = FileExplorerResponseSchema.parse({
      type: "file_explorer_response",
      payload: {
        cwd: "~/Desktop",
        path: ".",
        mode: "list",
        directory: { path: ".", absolutePath: "/Users/me/Desktop", entries: [] },
        file: null,
        error: null,
        requestId: "req-1",
      },
    });
    expect(parsed.payload.directory?.absolutePath).toBe("/Users/me/Desktop");
  });

  test("keeps absolutePath absent for an old daemon that never sends it", () => {
    const parsed = FileExplorerResponseSchema.parse({
      type: "file_explorer_response",
      payload: {
        cwd: "~/Desktop",
        path: ".",
        mode: "list",
        directory: { path: ".", entries: [] },
        file: null,
        error: null,
        requestId: "req-1",
      },
    });
    expect(parsed.payload.directory?.absolutePath).toBeUndefined();
  });
});
