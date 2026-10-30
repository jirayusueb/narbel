# Glossary

The ubiquitous language of each bounded context in [contexts.md](contexts.md). Class, method, event, route, and tool names come from these rows. A word means one thing inside its context. Where a neighbour uses the same word for something else, the third column says so.

A new word enters this file in the same pull request as the code that needs it. When a context moves into its own folder (migration steps 4 to 7), its section moves into that folder's `CONTEXT.md` and leaves this file, so there is never a second copy.

Words that are not business words, such as `data`, `item`, `record`, `info`, `manager`, or `status` alone, do not name domain code.

## drawing

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Drawing | The content of one board: its pages and the elements on them. Each board has exactly one drawing. | boards: Board, the thing a person owns and shares. Retires "scene", "doc", and "room" in domain code. |
| Page | A named canvas inside a drawing. A drawing always keeps at least one page. The first page is `page:main`, named "Page 1". |  |
| Element | One item on a page: a shape, text, connector, image, or frame. It is stored and sent in Excalidraw's format, and the domain reads it through a typed view. | Shape, which is one kind of element. Retires `SceneElement`. |
| Shape | An element that can hold a label and anchor a connector, such as a rectangle, ellipse, or diamond. | Element, the wider word. |
| Element key | `<pageId>:<elementId>`, the key an element is stored under. Every page shares one map, so the key carries the page. One implementation serves server and web. | Element id, the Excalidraw id inside the element. |
| Label | Text bound to a shape or a connector. It moves, restyles, and leaves a frame with its container. | A text element that stands alone. |
| Connector | An arrow or line. Each end binds to a shape or to nothing, and a bound end follows its shape. | Arrowhead, the style drawn at an end. |
| Frame | A named region of a page that holds elements. Deleting a frame releases its elements instead of deleting them. A frame cannot sit inside another frame. | Group, which has no region or name. |
| Group | Elements that select and move as one. Groups nest, and the outermost group acts. | Frame. |
| Lock | Mark an element so that every change and deletion is refused until the lock is lifted. Lifting the lock is the only change a locked element accepts. | boards: Unlock, which opens a password board. A board is never "locked". |
| Arrange | Align elements to a shared edge, or distribute them so their centres are evenly spaced. Locked elements and bound connectors are skipped. | Layout. |
| Layout | Place elements as a ranked graph that follows their connectors, leaving room for connector labels. | Arrange. |
| Image file | The bytes an image element shows, stored once per board and compressed to WebP. | identity: Avatar. |
| Render | Draw one page of a drawing as a PNG, for agents. Module `render`. |  |
| Room | The live copy of one drawing, shared by everyone connected to that board. It saves after a quiet second, at least every 10 seconds, and unloads 30 seconds after its last peer leaves. Module `live`. | boards: Board. |
| Peer | One open connection to a room. A peer is read-write or read-only, from the access it had when it joined. | boards: Viewer, a role. The MCP tool `list_viewers` returns peers. |
| Presence | The cursor, selection, and viewport that each peer broadcasts. Read-only peers broadcast presence too. |  |
| Follow | Make your viewport track another peer's, until you move the canvas yourself or press Esc. |  |
| Selection | The elements a peer has selected. Agents read and change the newest selection of a person's open client. |  |
| Change cursor | Where an agent last looked at a board: a drawing version and the last comment activity it was shown. The next read returns only what changed since. |  |

## boards

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Board | A workspace a person owns: a title, a visibility, an optional password, and an optional share link. | drawing: Drawing, the content of the board. |
| Owner | The person who created the board. The owner holds every right and cannot also hold a grant on the same board. |  |
| Title | The name of a board, 1 to 120 characters after trimming. | drawing: the name of a page or a frame. |
| Visibility | Who can open a board without a grant: Private, Public, or Password. | Share link, which works under any visibility. |
| Private | Visibility where only the owner and people with a grant open the board. |  |
| Public | Visibility where anyone with the board's address can view it, without an account. Stored as `link`. | Share link, which can also give edit. |
| Password | Visibility where anyone who unlocks the board with its password can view it. A board cannot take this visibility before it has a password. |  |
| Unlock | Prove the board's password once. The browser then holds an unlock proof for 90 days. Changing the password voids every proof. Attempts are limited per board and client address. | drawing: Lock. Retires "locked board": say "password board". |
| Role | What a person may do on a board: `owner`, `editor` (reads and writes), or `viewer` (reads). | drawing: Peer, a connection. |
| Grant | A role given to an email address on a board. At most one grant per board and email. | Member and Invitation, the two states of a grant. Retires "access row". |
| Invite | Give a role to an email address. The invitee gets a notification if they have an account, and an email. |  |
| Invitation | A grant whose email has no person attached yet. | Retires `BoardMember` with `userId: null`. |
| Claim | Attach a person to the invitation for their email, on that person's first access to the board. A claim happens once and never changes. |  |
| Member | A grant with a person attached. | identity: Person. |
| Remove | Delete a grant. The person loses access on their next request. |  |
| Share link | A secret token in a URL that gives `viewer` or `editor` to whoever holds it, until its optional expiry. A board has at most one. | Public visibility. Retires `board_share` as a domain word. |
| Guest | Anyone who is not signed in. A guest gets `viewer` at most, even through an editor share link. | identity: Agent, which acts for a signed-in person. |
| Access | The role an actor ends up with on a board. The most specific source wins: ownership, then a grant, then a share link, then visibility. | Role, one input to it. |
| Access policy | The question every other context asks `boards`: may this actor read, write, or own this board, which boards may this person read, and who are the owner and members of this board. |  |

## discussion

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Thread | A conversation pinned to a page: its first comment and every reply. | Comment. Retires "comment with `parentId`". |
| Comment | One message in a thread, 1 to 2000 characters. | Thread. |
| Reply | A comment added to a thread. A reply cannot itself be replied to. |  |
| Pin | The page and position on that page where a thread sits. |  |
| Mention | `@username` in a comment. It notifies that person if they are a member of the board. |  |
| Assign | Make one member responsible for a thread. The assignee must be a member. | boards: Grant. |
| Resolve | Mark a thread as done. Resolving a resolved thread changes nothing. |  |
| Reopen | Undo a resolve. Reopening an open thread changes nothing. |  |
| Reaction | One of 8 emoji that a reader puts on a comment: 👍 ❤️ 😂 🎉 😮 😢 👀 🚀. A person gives each emoji at most once per comment. |  |
| Excerpt | The opening of a comment, at most 140 characters, carried in notifications. |  |
| Recipients | The people who hear about something in a thread: its author, its assignee, and the people mentioned, kept only while they are members. `discussion` decides them, and `notification` only delivers. |  |

Only the author edits a comment. The author or the board owner deletes it.

## identity

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Person | A human with an account: id, display name, username, and avatar. | boards: Member, a person's grant on one board. Retires `UserRef`. |
| Account | How a person signs in: an email address and a password. | Person. |
| Username | The handle used in mentions: 3 to 20 lowercase letters, digits, or underscores, unique, matched without case. | Display name. |
| Display name | The name other people see. | Username. |
| Avatar | A person's picture. | drawing: Image file. |
| Agent | Software that acts for a person through an API key or MCP OAuth, with exactly that person's access. | boards: Guest. |
| API key | A secret that lets an agent act for the person who created it. | boards: Share link. |

## notification

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Notification | One entry in a person's inbox about something on a board: a reply, an assignment, a mention, a resolve, or an invitation. | Email, a separate delivery of some of the same events. |
| Inbox | A person's notifications, newest first. |  |
| Unread count | How many notifications the person has not marked read. |  |
| Mark read | Mark some or all of a person's notifications as read. |  |
| Email | A message sent to an address through the outbox. | Notification. |
| Outbox | The queue of messages and events, written in the same transaction as the change that caused them, so neither is lost nor sent without its change. |  |
| Dedupe key | The key that makes a second message for the same event a no-op, such as `mentioned:<commentId>:<personId>`. |  |
| Dead | An outbox message that failed its last attempt. It is never retried. |  |

## search

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Search | Find the boards a person can read whose title, element text, or comments contain the query. |  |
| Query | The searched text, 2 to 100 characters after trimming. Wildcards in it match literally. |  |
| Board text | The searchable text of a drawing, one row per element. | drawing: Label, one source of that text. |
| Snippet | The text around the first match, shown with a result. | discussion: Excerpt. |
| Readable boards | The boards a person may read, as the access policy answers it. Search never reads grants itself. |  |
