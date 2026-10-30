# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted equally (confirmed by the owner):

- Small product teams (designers, PMs, engineers) who whiteboard together live: system sketches, plans, retros.
- Developers who connect their AI agents (Claude, Cursor, any MCP client) to the same boards so the agent can read and edit what the team drew.

Both arrive at the same board. The person is usually at a desk, on a laptop or external display, mid-conversation with teammates or an agent.

## Product Purpose

narbel is a collaborative whiteboard. Signed-in users own boards drawn with Excalidraw; boards sync live between browsers; images dropped on a board are stored in S3; AI agents read and edit boards over MCP and their edits appear live. Success: a team and its agents work on one board without exporting, pasting, or re-explaining context.

## Positioning

The board is a shared surface for people and agents at once. An agent connected over MCP edits the same live CRDT document humans are drawing on, so its changes stream in like another collaborator's.

## Operating Context

- Boards are created, renamed, deleted from the dashboard; each board has pages, comments, presence (cursors, names, follow), undo/redo, and per-user preferences (grid, tool lock, snap, zen, stats).
- Sharing: visibility, password-protected boards, share links, email invites (Resend). Viewers get read-only boards.
- MCP: `POST /mcp` (Streamable HTTP) with 28 tools in groups: boards (`list_boards`, `list_shared_boards`, `search_boards`, `create_board`, `rename_board`, `get_board`, `get_board_image`), pages (`list_pages`, `add_page`, `rename_page`, `delete_page`), elements with style, labels, frames and lock (`add_elements`, `update_element`, `delete_elements`), layout (`group_elements`, `ungroup_elements`, `align_elements`, `distribute_elements`), selection (`get_selection`, `select`, `edit_selection`), images (`add_image`), export (`export_scene`) and comments (`list_comments`, `list_replies`, `add_comment`, `reply_comment`, `resolve_comment`); authenticated with an API key in `x-api-key`, created from the dashboard.
- Auth: email and password (Better Auth).

## Capabilities and Constraints

- Excalidraw 0.18 renders the canvas; its UI is themeable only through its CSS custom properties.
- TanStack Start web app, Feature-Sliced Design (`app/pages/widgets/features/entities/shared`), shared primitives in `packages/ui` (shadcn on React Aria).
- No public pricing, customers, or usage numbers exist.

## Brand Commitments

- Name: narbel, written lowercase in the wordmark.
- Visual reference made binding by the owner: the design system of intentapp.dev (warm greys, citrus accent, serif display over Inter UI, large soft radii, black/citrus button swap).
- Display face: the closest open-license serif to ABC Arizona Mix (owner chose an open substitute over licensing Arizona).
- Mark: an authored narbel mark (owner approved authoring one).

## Evidence on Hand

- No testimonials, customer logos, metrics, or screenshots exist. Do not fabricate any.
- Demonstration content on marketing surfaces (board names, collaborator names) is illustrative and must read as such.

## Product Principles

- People and agents are peers on the board; never present the agent as a separate product.
- Live is the default state; show sync and presence plainly, never hide connection problems.
- The canvas is the work; chrome stays quiet and out of the drawing's way.
- Sharing is explicit: who can see and edit a board is always legible.

## Accessibility & Inclusion

WCAG 2.2 AA for app chrome: contrast, keyboard access, visible focus, reduced motion respected.
