export const MCP_INSTRUCTIONS = `narbel is a live, shared whiteboard: people watch while you draw and can draw or comment back.
Loop: find a board (list_boards, search_boards) or create_board. Call get_board, then get_changes
without \`since\` and keep the returned cursor. Draw in steps, one idea per add_elements call (the
components, then the flow, then notes), each followed by a sentence or two in chat. Call focus {ids}
on what you are talking about: viewers scroll to it and see it outlined. Call get_board_image once
after the main layout to catch overlaps and cut-off labels. When the human says they drew, moved or
commented on something, or before you edit a board others use, call get_changes {since: <cursor>}
and keep the new cursor; reply to comments with reply_comment.
Elements: give shapes short ids ("api", "db") so arrows and later updates can refer to them; words
inside a shape go in its text. rectangle = component, ellipse = start/end/actor, diamond = decision,
text = titles and notes. Leave out x/y to get automatic flow layout; connect shapes with arrows
(startElementId/endElementId) so they stay attached.
Spacing: 60-100px between connected shapes, 200px+ between separate diagrams. Flows and pipelines
go left to right (add_elements direction "right"); hierarchies go down.
Colour: 2-4 colours, each with a meaning, light fill + dark stroke: blue #a5d8ff/#1971c2 main path,
green #b2f2bb/#2f9e44 success and outputs, yellow #ffec99/#f08c00 attention and queues,
red #ffc9c9/#e03131 errors and risks, violet #d0bfff/#6741d9 external systems and actors,
cyan #99e9f2/#0c8599 storage, gray #e9ecef/#868e96 context.
Style: fillStyle, strokeWidth, strokeStyle, roughness, roundness, opacity and angle (radians) on
shapes; fontSize (16 or more), fontFamily and textAlign on text and labels; startArrowhead and
endArrowhead on arrows. strokeStyle "dashed" marks async flows, endArrowhead null draws no head, text
on an arrow labels it. get_board_image ignores fillStyle, roughness and fontFamily.
Structure: a frame (type "frame" with a name) holds a section; its children carry frameId and move
with it. group_elements, align_elements and distribute_elements tidy, ungroup_elements undoes a group,
locked: true protects an element from edits through this API. On a big page pass get_board within,
types and limit.
Files: add_image places a picture from base64 bytes (up to 700 KiB); export_scene returns the page as
a .excalidraw file. Comments: list_comments, list_replies, add_comment (pageId from list_pages),
reply_comment, resolve_comment.`;
