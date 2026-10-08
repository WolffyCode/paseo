# Independent chats

Open **Chats**, choose a host and model, and send your first message. You do not
choose a project, directory, branch, or worktree. The sidebar puts Chats and New workspace
above Pinned, Projects, and Conversations. Conversations lists active independent chats;
its plus button opens Chats to compose a new conversation. Pinned conversations move to
Pinned and appear once. Project filters narrow ordinary projects without hiding conversations.
History, Search, and Schedules are optional navigation items in Sidebar settings.

Chats has its own list, rename, and archive actions. Leaving the page or closing an agent tab keeps the conversation;
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
to Chats. A last active chat cannot seed New workspace. Git reconciliation cannot turn a chat into a
checkout when the daemon's home happens to sit inside a Git repository.

## Creation and recovery

Creation uses the existing durable creation operation. Network retries retain their
operation identity. Known directory-allocation failures happen before registration
and permit another attempt. If provider startup fails before an agent is registered,
archive the incomplete allocation before publishing failure. Replaying that operation
can restore its backing record. An unknown outcome stays blocked from automatic replay.

Clear only the consumed input after successful creation; a newer draft belongs to the
user. Preserve failed drafts and display an actionable error. Cache the explicit purpose
with both project and workspace records so cold reads do not briefly expose chat backing
as an ordinary project.

## Version boundaries

The client checks `server_info.features.independentChats`. An older host requires an
update. The SDK refuses unsupported creation before sending a request. New purpose
fields are optional and existing workspace-kind wire values stay unchanged; old clients
can still parse directory and project updates. See [protocol compatibility](protocol-compatibility.md).

Each conversation retains its selected coding-agent provider. Cross-provider conversation
switching and a new shared-message room model are separate work.

Validation and integration evidence: [independent chat review](qa-evidence/independent-chats/review.md).
