# Conversations

Open **New conversation**, choose a model, and send your first message. The workspace
directory is optional: choosing one creates a project conversation; leaving it empty
creates an independent conversation. Global creation starts without a directory. An
entry inside a project supplies that project's context. Clearing the directory keeps
the draft. Adding a new directory through the picker also keeps the form and draft.

The sidebar uses one creation entry above Pinned, Projects, and Conversations. Search
and Schedules retain their normal entries. Conversations lists independent conversations.
The Projects plus button and Conversations compose button open the same creation form.
Pinned, Projects, and Conversations collapse independently and remember their state on
the device. Collapsing hides the section's rows and empty state while keeping its header
actions available. Keyboard workspace shortcuts skip collapsed sections in either grouping
mode. Pinned conversations move to Pinned and appear once. Project filters narrow ordinary
projects without hiding conversations.

Conversation rows own reopen, rename, pin, and archive actions. Leaving the page or closing an agent tab keeps the conversation;
explicit archive stops its agents and removes it from the active list. Open archived
conversations through History.

## Runtime ownership

Coding-agent providers require a working directory and the existing daemon lifecycle.
Each chat receives a private directory under the selected host's `$PASEO_HOME/chats`.
The daemon manages a directory workspace and its parent internally; they are execution
backing, not user-selectable projects. Chat identity is the persisted `purpose: "chat"`
field. Names, paths, and project keys never determine whether something is a chat.

Exclude the backing project from project pickers and sidebar project groups. Conversation
rows omit the backing directory and Git metadata. Archiving the active conversation returns
to New conversation without a directory. A last active chat cannot seed a project choice.
Git reconciliation cannot turn a chat into a
checkout when the daemon's home happens to sit inside a Git repository.

## Creation and recovery

Creation uses the existing durable creation operation. Network retries retain their
operation identity. Known directory-allocation failures happen before registration
and permit another attempt. If provider startup fails before an agent is registered,
archive the incomplete allocation before publishing failure. Replaying that operation
can restore its backing record. An unknown outcome stays blocked from automatic replay.

Each creation entry opens a fresh draft. The foreground draft identity owns navigation;
a slow older creation cannot redirect a newer form. Clear only the consumed input after
successful creation. Preserve failed drafts and display an actionable error. Known rejected
attempts receive a new operation identity; uncertain outcomes retain theirs. Cache the explicit purpose
with both project and workspace records so cold reads do not briefly expose chat backing
as an ordinary project.

## Version boundaries

Without a directory, the client checks `server_info.features.independentChats` and asks
you to update an unsupported host. Choosing a project retains the existing workspace
creation contract. The SDK refuses unsupported chat creation before sending a request. New purpose
fields are optional and existing workspace-kind wire values stay unchanged; old clients
can still parse directory and project updates. See [protocol compatibility](protocol-compatibility.md).

Each conversation retains its selected coding-agent provider. Cross-provider conversation
switching and a new shared-message room model are separate work.

Validation and integration evidence: [independent chat review](qa-evidence/independent-chats/review.md).
