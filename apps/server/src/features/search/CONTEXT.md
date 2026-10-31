# search: ubiquitous language

The words of the `search` context, moved here from [docs/architecture/glossary.md](../../../../../docs/architecture/glossary.md) when the context got its own folder (migration step 7). A word means one thing inside this context; the third column names the neighbour's word it must not be confused with.

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Search | Find the boards a person can read whose title, element text, or comments contain the query. |  |
| Query | The searched text, 2 to 100 characters after trimming. It matches any case, and wildcards in it match literally. |  |
| Readable boards | The boards a person may read, with their current titles and the person's role, as `AccessPolicy.readableBoards` answers it. Search never reads boards, grants, or comments itself. | boards: Grant. |
| Mirror | Search's own copy of another context's text, kept by that context's events: board text from `drawing`, comment text from `discussion`. A mirror applies a change only over an older one. |  |
| Board text | The searchable text of a drawing, one row per element, replaced as a whole set by `event.drawing-text-changed`. | drawing: Label, one source of that text. |
| Comment text | The body of one comment as search last heard it. A deleted comment stays as an empty row, so a late post or edit cannot bring it back. | drawing: Tombstone. discussion: Comment. |
| Snippet | The text around the first match, shown with a result. | discussion: Excerpt. |
