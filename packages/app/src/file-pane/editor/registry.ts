import { resolveWorkspaceFilePaths } from "@/workspace/file-open";
import { LiveFileModel, type LiveFileSession } from "../live-file/model";
import { createFileObservationSource } from "./observation-source";
import {
  FileEditorModel,
  type FileEditorFile,
  type FileEditorSession,
  type FileEditorClock,
} from "./model";

type DocumentSession = FileEditorSession & LiveFileSession;
interface DocumentEntry {
  model: FileEditorModel;
  liveFile: LiveFileModel;
  views: number;
  session: DocumentSession | null;
  unsubscribe: () => void;
}

/** A document outlives its views while a save or an unsaved edit still needs it. */
export function createFileEditorRegistry() {
  const documents = new Map<string, DocumentEntry>();

  function collect(key: string, entry: DocumentEntry) {
    queueMicrotask(() => {
      if (
        documents.get(key) !== entry ||
        entry.views > 0 ||
        entry.model.getSnapshot().status !== "clean"
      )
        return;
      documents.delete(key);
      entry.unsubscribe();
      entry.liveFile.close();
      entry.model.dispose();
    });
  }

  return {
    open(input: {
      serverId: string;
      cwd: string;
      path: string;
      file: FileEditorFile;
      session: DocumentSession;
      clock?: FileEditorClock;
    }) {
      const identity = resolveWorkspaceFilePaths({ workspaceRoot: input.cwd, path: input.path });
      if (!identity) throw new Error("A document requires an absolute host path");
      const key = JSON.stringify([input.serverId, identity.absolutePath]);
      let entry = documents.get(key);
      if (!entry) {
        const model = new FileEditorModel(input);
        entry = {
          model,
          liveFile: new LiveFileModel(),
          views: 0,
          session: null,
          unsubscribe: () => {},
        };
        const ownedEntry = entry;
        entry.unsubscribe = model.subscribe(() => collect(key, ownedEntry));
        documents.set(key, entry);
      }
      const document = entry;
      return {
        model: document.model,
        retain(session: DocumentSession) {
          document.views += 1;
          document.model.setSession(session);
          if (document.session !== session) {
            document.session = session;
            document.model.connectFileObservations(createFileObservationSource(document.liveFile));
            document.liveFile.open({
              session,
              target: { cwd: input.cwd, path: input.path },
              liveUpdates: true,
            });
          }
          let released = false;
          return () => {
            if (released) return;
            released = true;
            document.views -= 1;
            collect(key, document);
          };
        },
      };
    },
    dispose() {
      for (const document of documents.values()) {
        document.unsubscribe();
        document.liveFile.close();
        document.model.dispose();
      }
      documents.clear();
    },
  };
}

export const fileEditorRegistry = createFileEditorRegistry();
