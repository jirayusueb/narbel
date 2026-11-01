# discussion: ubiquitous language

The words of the `discussion` context (the context got its folder in step 5). A word means one thing inside this context; the third column names the neighbour's word it must not be confused with.

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

Only the author edits a comment. The author or the board owner deletes it. Deleting a thread deletes its replies. Every post, edit, and delete is also published with the comment's text, or the deleted ids, for contexts that mirror comment text.
