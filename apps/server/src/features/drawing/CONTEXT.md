# drawing: ubiquitous language

The words of the `drawing` context, which got its own folder in migration step 6. A word means one thing inside this context; the third column names the neighbour's word it must not be confused with.

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Drawing | The content of one board: its pages and the elements on them. Each board has exactly one drawing. | boards: Board, the thing a person owns and shares. Retires "scene", "doc", and "room" in domain code. |
| Page | A named canvas inside a drawing. A drawing always keeps at least one page. The first page is `page:main`, named "Page 1". |  |
| Element | One item on a page: a shape, text, connector, image, or frame. It is stored and sent in Excalidraw's format, and the domain reads it through a typed view. | Shape, which is one kind of element. Retires `SceneElement`. |
| Shape | An element that can hold a label and anchor a connector, such as a rectangle, ellipse, or diamond. | Element, the wider word. |
| Tombstone | The marker a deletion leaves in the drawing, so concurrent edits and late joiners converge. It leaves the document 24 hours later, by a key delete, which cannot beat a concurrent offline undo. |  |
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
| Change cursor | Where an agent last looked at a board: a drawing version and the last comment activity it was shown. The next read returns only what changed since. A read older than a day may miss deletions older than a day. |  |
