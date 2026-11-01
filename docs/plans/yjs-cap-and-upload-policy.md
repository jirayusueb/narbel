# Plan: Yjs document cap and upload size binding

Owner decision (2026-11-01): plan the full set, do not implement yet. This closes the deferred review item in `docs/decisions.tsv` row 131.

## Current state

- The websocket path accepts arbitrary Yjs updates from editors. Page names (`infrastructure/crdt/pages.ts:121`) and element text wrap in entities with no length check, because editors write the CRDT document directly and never pass the usecases that validate.
- `DrizzleBoardDocumentStore.save` persists `state` with no size cap.
- `PresignBoardFileUpload` validates the declared size (10 MiB cap in `UploadRules`), but the presigned PUT does not bind Content-Length. A client can declare 1 byte and PUT 500 MiB. `AddBoardImage` later downloads the object and reads its header, so mime and pixel caps hold, but the oversized object is already stored and paid for.

## Work items

### 1. Receive-time document cap (drawing)

- Measure first: query `max(length(state))` over the `drawing` rows and pick a cap with headroom (proposal: 2x the current max, floor 1 MiB, ceiling 4 MiB).
- Enforce in `YjsBoardHub` where updates are applied: if applying an update would push `Y.encodeStateAsUpdate` over the cap, reject the update and answer the client with a typed error ("board is full"), not silence. A rejected update diverges that client, so the client must reload the board on that error.
- Backstop in `DrizzleBoardDocumentStore.save`: refuse to persist a state over the cap and log. The backstop never triggers in normal operation; it exists so a bug in the hub cannot bloat the database.
- Tests: hub test that a room under cap accepts, at cap rejects with the typed error; store test that an oversized save is refused.

### 2. Actual-size check at AddBoardImage (drawing, small)

- `AddBoardImage` already downloads the object. Compare the object's Content-Length against the size registered at presign time (`UploadRules.MAX_FILE_BYTES` and the row in the file repository). A mismatch deletes the object and answers `payloadTooLarge`.
- This closes the "declared 1 byte, stored 500 MiB" hole for the API path even before item 3.

### 3. POST policy for uploads (optional, after 1 and 2)

- Replace the presigned PUT with an S3 POST policy carrying `content-length-range` equal to the declared size bucket. The browser uploads through a form POST instead of a PUT.
- Needs verification that the RustFS store implements POST policies; check with a throwaway script against the local RustFS container before writing any web code.
- Touches `IFileStorage`, `BunS3FileStorage`, `presign-board-file-upload.ts`, and the web upload code. Largest item, only worth it if item 2's cleanup path is not enough in practice.

## Sequencing and effort

| Item | Size | Risk |
| --- | --- | --- |
| 1 receive-time cap + save backstop | medium | a rejected update must not corrupt the room; needs the client reload contract |
| 2 actual-size check at AddBoardImage | small | deletes only objects the actor just uploaded |
| 3 POST policy | large | store support unverified; changes the web upload flow |

Ship 2 first (small, immediate), then 1, and decide 3 after watching 2 in production.

## Verification for each item

- Item 1: redproof gates plus new hub and store tests; manual smoke: connect a client, push an oversized page name and an oversized text element, observe the typed error and that the board reloads.
- Item 2: test that an object larger than registered is deleted and the answer is `payloadTooLarge`; curl smoke against a local store.
- Item 3: throwaway POST-policy script against local RustFS before any product code.

## Open questions for the owner

- The cap number (after the measurement query proposes one).
- Whether a full-board error should also notify the owner by email or only show in the client.
