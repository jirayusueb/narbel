export const DESIGN_GUIDE = `# Drawing on narbel boards

## Workflow
1. list_boards (yours) or list_shared_boards (shared with you); search_boards finds one by text; create_board starts a new one; rename_board retitles it (owner only).
2. get_board reads a page. Narrow it with within (a region), types and limit; the reply says total and truncated. list_pages, add_page, rename_page and delete_page manage pages.
3. add_elements draws. Give shapes an id and leave x/y out so they are laid out along the arrows (direction down or right).
4. get_board_image renders the page to a PNG. Look at it, then fix with update_element, edit_selection or delete_elements.
5. get_selection and select show and set what the user has selected.

## Style
Pick a stroke/fill pair (strokeColor / backgroundColor):
- blue #1971c2 / #a5d8ff
- green #2f9e44 / #b2f2bb
- red #e03131 / #ffc9c9
- orange #e8590c / #ffd8a8
- violet #9c36b5 / #eebefa
- cyan #0c8599 / #99e9f2
- gray #868e96 / #e9ecef
- default #1e1e1e / transparent

One color pair per meaning. Labelled boxes are about 160x80, fontSize at least 16, 40-80 px gaps between shapes.

## Arrows
Bind with startElementId and endElementId. Label with text. strokeStyle dashed marks async flows. endArrowhead null draws no head.

## Structure
- A frame (type frame, with name) groups a section; its children carry frameId.
- group_elements and ungroup_elements, align_elements and distribute_elements tidy a selection.
- locked protects an element from edits through this API.

## Pictures and files
- add_image places a picture (up to 700 KiB).
- export_scene saves the page as a .excalidraw file.

## Comments
list_comments shows threads, list_replies one thread's replies, reply_comment answers, add_comment pins a new thread on a page (pageId from list_pages), resolve_comment closes or reopens it.

## Caveats
get_board_image ignores fillStyle, roughness and fontFamily, so a hachure fill looks solid there. angle is in radians.
`;
