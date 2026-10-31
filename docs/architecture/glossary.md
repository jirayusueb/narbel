# Glossary

The ubiquitous language of each bounded context in [contexts.md](contexts.md). Class, method, event, route, and tool names come from these rows. A word means one thing inside its context. Where a neighbour uses the same word for something else, the third column says so.

A new word enters this file in the same pull request as the code that needs it. When a context moves into its own folder (migration steps 4 to 7), its section moves into that folder's `CONTEXT.md` and leaves this file, so there is never a second copy. Moved so far: [boards](../../apps/server/src/features/boards/CONTEXT.md) and [drawing](../../apps/server/src/features/drawing/CONTEXT.md) (step 6), [discussion](../../apps/server/src/features/discussion/CONTEXT.md) and [search](../../apps/server/src/features/search/CONTEXT.md) (step 7).

Words that are not business words, such as `data`, `item`, `record`, `info`, `manager`, or `status` alone, do not name domain code.

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
