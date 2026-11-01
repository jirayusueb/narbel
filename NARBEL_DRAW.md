# Narbel Draw: core ใหม่ของ editor (lib `ndraw`)

สรุปจากการคุยออกแบบ 2026-10-31 ยังไม่มีโค้ด เอกสารนี้แยกให้เห็นว่าเรื่องไหน **เจ้าของเลือกแล้ว** เรื่องไหนเป็น **ข้อเสนอ** ที่ยังรอยืนยัน และเรื่องไหน **ยังเปิดอยู่**

## เป้าหมาย

- เลิกพึ่ง state ภายในของ Excalidraw แล้วทำ core ของ editor เองเป็น lib ชื่อ `ndraw` (ชื่อชั่วคราว) โดยใช้แนวคิด record ของ tldraw และทำให้ดีกว่าในเรื่องที่ Narbel ต้องการ
- งานที่ไม่ต้องดูทั้งบอร์ดต้องไม่วนทั้งบอร์ด: culling, hit test, การส่งการเปลี่ยน และการ render
- ลูกศรที่เชื่อม shape (connector) ต้องทำงานดี ทั้งตอนคนแก้และตอน agent แก้
- MCP agent ต้องเป็นเพื่อนร่วมงานคนหนึ่งในบอร์ด ไม่ใช่แค่ API

## สิ่งที่เจ้าของเลือกแล้ว

| เรื่อง | ที่เลือก |
| --- | --- |
| Spatial index | Flatbush |
| State | Signals |
| งานหนัก | ย้ายไป Worker |
| Render | LOD และ tile cache |
| รูปแบบข้อมูล | record แบบ tldraw พร้อมความสามารถ 1–5 ในหัวข้อ "ความสามารถเพิ่มจาก tldraw" |
| MCP | เพื่อนร่วมงานที่มาจาก AI client ของผู้ใช้ (ทาง ก) |
| ลูกศร | core ต้องรองรับ connector อย่างดี |
| ชื่อ lib ใหม่ | `ndraw` (ชื่อชั่วคราว) |

## สภาพปัจจุบัน

### งานที่วนทุก element

| งาน | ตอนนี้ | แก้ด้วย |
| --- | --- | --- |
| culling (`getVisibleCanvasElements` ใน Excalidraw) | วนทุก element ทุกครั้งที่ render | Flatbush |
| hit test (`getElementsAtPosition`) | filter ทุก element แล้วเรียก `hitElement` ทีละตัว ทั้งตอนกดเมาส์และตอน hover | Flatbush |
| ลากกล่องเลือก (`getElementsWithinSelection`) | filter ทุก element ทุกครั้งที่เมาส์ขยับ และเรียก `getContainingFrame`/`getElementBounds` ทีละตัว | Flatbush |
| ส่งการแก้ขึ้น Yjs (`write-changed-elements.ts`) | `onChange` ส่ง scene ทั้งก้อนมา แล้วเทียบ `version` ทุกตัว ทุก 33 ms | store ที่บอกว่าอะไรเปลี่ยน |
| รับการแก้จากคนอื่น (`use-board-collab.ts:302-344`) | สร้าง Map ของทุก element, `sort` ทั้ง scene, `updateScene` ทั้งก้อน | store ที่บอกว่าอะไรเปลี่ยน |
| UI ของ Excalidraw | `App` เป็น class component ตัวเดียว เรียก `setState` แล้ว render ใหม่ทั้งก้อน | signals |

### เอกสาร Yjs

- `pages`: Y.Array
- `elements`: Y.Map ที่ key เป็น `page:<id>:<elementId>` และ value เป็น JSON ของ element ทั้งก้อน
- `files`, `meta` (ใช้ตอน restore), `agents`
- awareness เก็บเคอร์เซอร์, selection, `pageId` และ viewport

ระบบที่ผูกกับโครงนี้: `YjsBoardHub`, การเก็บลง Postgres, history/restore, cursor ของ `get_changes`, tombstone pruning, `board_text`, GC ของไฟล์, IndexedDB และ `SceneAccess` ของ MCP

### ขนาดที่วัดได้

วัดด้วย element ตัวอย่างตัวเดียวในเอกสาร Yjs เดียว ยังไม่ได้วัดกับบอร์ดจริงหรือ fixture S/M/L

| กรณี | ขนาด |
| --- | --- |
| JSON ของ rectangle | 486 B |
| rectangle ที่ตัดค่า default ออก | 260 B |
| freedraw 200 จุด (เป็น `points` ไป 2,903 B) | 3,463 B |
| `points` ชุดเดียวกันเก็บเป็น Float32 | 1,600 B |
| Yjs update ต่อการลาก 1 ครั้ง แบบเก็บทั้งก้อน (rectangle / freedraw) | 400 B / 4,318 B |
| Yjs update ต่อการลาก 1 ครั้ง แบบ Y.Map ซ้อนต่อ element | 71 B / 71 B |
| เอกสารหลังลาก 500 ครั้ง แบบเก็บทั้งก้อน (rectangle) | 424 → 441 B |
| เอกสารหลังลาก 500 ครั้ง แบบ Y.Map ซ้อน (rectangle) | 656 → 18,565 B |

สรุป:

- ลาก freedraw หนึ่งตัวเท่ากับส่ง `points` ทั้งชุดทุก 33 ms ทั้งที่การลากเปลี่ยนแค่ `x` กับ `y`
- Y.Map ซ้อนต่อ element ทำให้ update เล็ก แต่เอกสารโตเรื่อย ๆ และ Yjs จะตัดสินการชนกันทีละ field ซึ่งขัดกับกติกา `version`/`versionNonce` (decision 5, 119)

### ลูกศรตอนนี้

- Excalidraw เก็บการผูกไว้สองฝั่ง: ลูกศรมี `startBinding`/`endBinding` และ shape มี `boundElements`
- ขยับ shape แล้วต้องเขียน `points` ของลูกศรใหม่ด้วย คนลาก shape กับคนแก้ลูกศรจึงชนกันที่ record ของลูกศร
- ฝั่ง server ดูแลสองฝั่งนี้เองใน `apps/server/src/features/drawing/domain/rules/bindings.ts`
- `ArrangeElements.ts:60` ข้ามลูกศรที่ผูกอยู่ไปเลย (`reason: "connector"`)

### MCP ตอนนี้

- เลือก: `select`, `focus`, `get_selection` (อ่าน selection ล่าสุดของใครก็ได้)
- แก้: `update_element`, `edit_selection`, `delete_elements`, `group_elements`, `align_elements`, `distribute_elements`, `connect`
- อ่าน: `get_board` (ทั้งหน้า), `get_changes` (ตาม cursor), `get_board_image`, `search_boards`
- ขีดจำกัด:
  - อ่านเฉพาะ frame, เฉพาะพื้นที่ หรือเฉพาะชนิดไม่ได้
  - สิทธิ์ของ key เท่ากับสิทธิ์ของเจ้าของทั้งบอร์ด
  - แก้ชนกับคนแล้วไม่มีอะไรบอก

## การ port Excalidraw lib

**ข้อเสนอ** วิธี port ยังรอยืนยัน และขึ้นกับคำถามเรื่อง UI (คำถามข้อ 3)

### ใช้อยู่แค่ไหน

- `apps/web` ล็อก `@excalidraw/excalidraw` ไว้ที่ `0.18.1` (MIT)
- 23 ไฟล์ import จากแพ็กเกจนี้ จำนวน import แยกตาม path:
  - `@excalidraw/excalidraw` (runtime): 5
  - `/types`: 14
  - `/element/types`: 12
  - `/data/library`: 1
- ฝั่ง server ไม่ได้ใช้แพ็กเกจนี้ มี adapter แปลงไปกลับของตัวเองแบบไม่เสียข้อมูล (step 6c)

### โค้ดที่เขียนอ้อมพฤติกรรมของ lib (จาก `docs/decisions.tsv`)

| decision | อ้อมเรื่องอะไร |
| --- | --- |
| 16 | Excalidraw แก้ element ในที่เดิม (mutate in place) ต้อง copy ก่อนเขียนลง Yjs |
| 17 | ตอนเริ่ม Excalidraw สร้าง scene ทับข้อมูลจาก server ต้องรอ `sceneReady` |
| 53 | ต้องเรียง z-order เองด้วย fractional index ทั้งตอนโหลดและตอนรับการแก้จากคนอื่น |
| 54 | toolbar ขยับตอนสลับโหมด compact จน render วน (React #185) |
| 117 | ปุ่มลัดตามแป้นพิมพ์ภาษาไทยทำจากข้างนอก |
| 119 | Yjs ตัดสินชนกันด้วย clientID แต่ Excalidraw ใช้ `version` สองฝั่งตัดสินไม่ตรงกัน |

core ใหม่ควรทำให้โค้ดอ้อมทั้งหกจุดนี้ไม่จำเป็นอีก

### ทางเลือก

|  | ทำอะไร | ได้ | เสีย |
| --- | --- | --- | --- |
| 1. `bun patch` | แก้แพ็กเกจที่ติดตั้งไว้ทีละจุด | ถูกที่สุด อัปเดตตาม upstream ง่าย | แก้ได้แค่จุดเล็ก เปลี่ยน state เป็น signals ไม่ได้ |
| 2. Fork ทั้ง monorepo ของ upstream | เอา `excalidraw`, `element`, `math`, `common` จาก tag `v0.18.x` มาเป็น workspace package แล้วเปลี่ยนไส้ทีละส่วน | ได้ UI เดิมทั้งชุด | ต้องดูแลระบบ build และ merge upstream เอง `App` กับ `setState` ผูกทุก component จึงเปลี่ยนเป็น signals ยาก |
| 3. Vendor เฉพาะส่วนที่ไม่ผูกกับ UI | เอา geometry, การวาดแต่ละ element (shape ของ rough.js, cache ภาพต่อ element), การวัดข้อความ/ฟอนต์, `restoreElements` และ export มาใส่ใน `ndraw` ส่วน editor (state, tool, UI) เขียนใหม่บน signals | เข้ากับ core ใหม่ได้ตรงที่สุด ภาพที่วาดออกมาเหมือน Excalidraw ไฟล์ `.excalidraw` ยังใช้ได้ | ต้องทำ toolbar, เมนู, dialog และ tool เอง |

แนะนำทาง 3 เพราะ core ใหม่ไปแทน state ของ `App` อยู่แล้ว ถ้าคำถามข้อ 3 ได้คำตอบว่าต้องคง UI เดิม ให้ใช้ทาง 2 ไประหว่างที่ทำ UI ใหม่

### วิธี vendor

- `@excalidraw/element`, `/math`, `/common` บน npm มีแค่ prerelease `0.18.0-f0063e113` จึงต้อง vendor จากซอร์สของ tag ที่ระบุ
- จดเลข commit ต้นทางไว้ใน `ndraw` และเก็บรายการไฟล์ที่แก้เทียบกับต้นทาง
- รับ bug fix จาก upstream ด้วยการ cherry-pick เป็นครั้ง ๆ ไม่ merge ทั้งหมด
- เก็บ LICENSE (MIT) ของ Excalidraw ไว้ใน `ndraw` คู่กับโค้ดที่ vendor มา
- ระหว่างย้าย `apps/web` ใช้แพ็กเกจเดิมคู่กับ core ใหม่ได้ เพราะ format ของ element ที่ขอบยังเหมือนกัน

## Schema ใหม่

**ข้อเสนอ** ทุกข้อในหัวข้อนี้ใช้ได้ไม่ว่าจะเลือก engine ตัวไหน

### Record

- `shape { id, type, parentId, index, x, y, rotation, opacity, locked, props, meta }` ค่าที่ใช้เฉพาะแต่ละชนิดอยู่ใน `props`
- `page`: record ของตัวเอง แทน prefix ใน key
- `group`: เป็น parent แทน array `groupIds` ที่ต้องเก็บซ้ำในทุก element
- `binding`: ดูหัวข้อลูกศร
- `asset`: แทน `files`
- `parentId` ทำให้บอร์ดเป็น tree: หน้า > frame > group > shape

### ขอบเขตของ state

| ขอบเขต | ข้างในมีอะไร | sync | เก็บถาวร |
| --- | --- | --- | --- |
| document | record ทั้งหมด | ใช่ | ใช่ |
| presence | เคอร์เซอร์, selection, element ที่กำลังลาก, viewport, สถานะของ agent | ใช่ | ไม่ |
| session | กล้อง, เครื่องมือที่เลือก | ไม่ | ไม่ |

ตอนนี้ AppState ของ Excalidraw รวมทั้งสามขอบเขตไว้ใน object เดียว

### กติกาการเก็บ

- ไม่เก็บค่า default
- เก็บส่วนหนัก (`points`, `pressures`) แยก key เพื่อให้การลากไม่ส่งส่วนนี้ซ้ำ
- ไม่มี `version`/`versionNonce`/`updated` ให้ engine ตัดสินการชนกันชั้นเดียว ปัญหาใน decision 119 จะหายไป
- ระหว่างลาก ส่งตำแหน่งทาง presence แล้วเขียนลง document ครั้งเดียวตอนปล่อยเมาส์ ระบบ flush ตอน `pagehide` และสลับหน้าที่มีอยู่แล้วยังต้องทำงาน
- schema มีเลข version และ migration บอร์ดเก่าแปลงตอนโหลด แบบที่ `ensurePages` เคยทำ
- JSON แบบ Excalidraw อยู่แค่ที่ขอบ: MCP, import/export `.excalidraw` และ adapter ไปยังตัววาด
- schema ของ `add_elements` ต้องเหมือนเดิมทุก byte

### Presence: กันของกระตุกตอน sync (rubber banding)

อาการแบบเกมออนไลน์ที่ของขยับเป็นจังหวะหรือดีดกลับ เกิดได้สามที่:

- **ของของคนอื่นที่กำลังถูกลาก**: ตำแหน่งมาทาง presence ทุก 33 ms ภาพจึงขยับเป็นจังหวะ ให้เกลี่ยตำแหน่งระหว่างจุดที่ได้รับ (interpolation) ยอมช้ากว่าความจริงราวหนึ่งช่วงแลกกับความลื่น แบบ `perfect-cursors` ของ tldraw ใช้ทั้งกับเคอร์เซอร์และกับ element ที่กำลังถูกลาก
- **ตอนปล่อยเมาส์**: ถ้าตำแหน่งที่ลง document ไม่ตรงกับตำแหน่งสุดท้ายที่คนดูเห็นจาก presence ของจะกระโดด ต้องส่งตำแหน่งสุดท้ายทาง presence ก่อนเขียนลง document หรือให้ฝั่งคนดูเลื่อนไปหาตำแหน่งใน document แบบนุ่ม
- **ชนกัน**:
  - engine A: สองคนลากตัวเดียวกัน คนที่แพ้เห็นของตัวเองดีดไปที่ของอีกคน
  - engine B: client แก้ไปก่อนแล้ว server ตัดสินทับ ก็ดีดกลับเหมือนกัน เป็นข้อเสียที่ B มีมากกว่า A
  - ลดโอกาสชนด้วยการแสดงว่าคนอื่นกำลังจับ element นั้นอยู่ (selection ใน presence ข้อ 5)

## Engine ที่ใช้ sync

**ยังเปิดอยู่** ผมแนะนำ A

|  | A. Yjs ต่อ แต่ใช้ schema ใหม่ | B. Server เป็นตัวตัดสิน (แบบ tldraw sync หรือ Figma) | C. Loro |
| --- | --- | --- | --- |
| ทำงานยังไง | แต่ละ record เป็น value เดียวใน Y.Map แยกตามชนิด store รับการเปลี่ยนจาก `observe` | client แก้ในเครื่องก่อนแล้วส่ง diff, server เรียงลำดับ, ตัดสินชนกันทีละ property แบบใครมาทีหลังชนะ | CRDT แบบ WASM มี map แยก property, tree ที่ย้าย parent ได้, snapshot ที่ตัดประวัติได้ |
| ได้อะไร | offline, IndexedDB, history, `get_changes` ใช้ต่อได้ | ไม่มี metadata ของ CRDT, cursor เป็นเลขลำดับ, ตรวจสิทธิ์ที่ server ตรง ๆ | merge ทีละ property โดยเอกสารไม่โต |
| เสียอะไร | ตัดสินชนกันทั้ง record | เขียน hub, history, IndexedDB, MCP ใหม่หมด, offline ยากขึ้น, `@tldraw/sync-core` ใช้ license ของ tldraw | เขียนใหม่เกือบเท่า B, เทคโนโลยีใหม่ |
| ย้อนกลับได้ไหม | ได้ | ยาก | ยาก |

เหตุผลที่แนะนำ A: ของดีส่วนใหญ่มาจาก schema ไม่ใช่จาก engine และ schema ที่ไม่ผูกกับ engine เปิดทางให้ย้ายไป B หรือ C ทีหลังได้

## Store แบบ Signals

- Yjs ส่ง `keysChanged` มาให้อยู่แล้ว store จึงรู้ว่าอะไรเปลี่ยนโดยไม่ต้องเทียบทั้ง scene
- แต่ละ shape render ใหม่เฉพาะตอนข้อมูลที่ตัวเองใช้เปลี่ยน
- รวมการเปลี่ยนหลายอย่างเป็นการแจ้งครั้งเดียว
- cache geometry ไว้ คำนวณใหม่เฉพาะตอน shape เปลี่ยน
- ตัวเลือก library (ยังเปิดอยู่):
  - `@tldraw/state` 5.6.0 (MIT): มี computed ที่รู้ว่าเปลี่ยนอะไรไปตั้งแต่ครั้งก่อน index จึงอัปเดตจากรายการนั้นได้ตรง ๆ **แนะนำตัวนี้**
  - `alien-signals` 3.2.1
  - `@preact/signals-core` 1.14.5
- `@tldraw/store` และ `@tldraw/tlschema` เป็น MIT เอาวิธีออกแบบมาใช้ได้

## Spatial index: Flatbush

- ใช้ Flatbush 4.7.0 คู่กับรายการตัวที่เพิ่งเปลี่ยน:
  - element ที่ถูกแก้หรือกำลังลากจะย้ายไปอยู่ในรายการนี้
  - ตอนค้นหาให้ถาม Flatbush แล้ววนรายการนี้ต่อ
  - พอรายการยาวเกินเกณฑ์ สร้าง index ใหม่ตอนว่าง
- worker สร้าง index แล้วส่ง `ArrayBuffer` กลับมาโดยไม่ copy main thread เปิดด้วย `Flatbush.from(buffer)`
- hit test ค้นบน main thread เพราะ pointer event ต้องได้คำตอบทันที
- กล่องของแต่ละ element ต้องรวมความหนาเส้น ระยะยอมให้คลาดของ hit test และการหมุนไว้แล้ว
- hit test ได้ตัวที่อาจโดนมาแล้ว เรียงตาม fractional index จากบนลงล่าง แล้วหยุดที่ตัวแรกที่ `hitElement` ตอบว่าโดน
- ใช้ตอบ query ของ MCP ตามพื้นที่ ใช้หาเส้นทางลูกศร และใช้หา tile ที่ต้องทิ้ง
- ลากกล่องเลือก (rubber-band selection):
  - ถาม Flatbush ด้วยกล่องเลือก ได้เฉพาะตัวที่อาจอยู่ในกล่อง
  - ตรวจเฉพาะส่วนต่างระหว่างกล่องเก่ากับกล่องใหม่ ตัวที่อยู่ข้างในทั้งสองกล่องไม่ต้องตรวจซ้ำ
  - frame ใช้ tree (`parentId`) แทนการเรียก `getContainingFrame` ทีละตัว
  - MCP ใช้ query เดียวกันได้ เช่น "เลือกทุกอย่างในกล่องนี้"

ข้อจำกัด: ตอนซูมออกจนเห็นทั้งบอร์ด index คืนเกือบทุก element ต้นทุนช่วงนั้นต้องแก้ด้วย LOD และ tile cache

## Render: LOD และ tile cache

### LOD

- ใช้ zoom ที่นิ่งระหว่างกล้องขยับ (แบบ `getEfficientZoomLevel` ของ tldraw)
- ลดรายละเอียดตามขนาดบนจอ:
  - ปิดลายเส้นแบบ rough
  - freedraw ใช้จุดน้อยลง
  - ข้อความเล็กมากวาดเป็นแถบสี
  - รูปใช้ไฟล์ความละเอียดต่ำ (ฝั่ง S3 ยังไม่มีไฟล์ขนาดย่อย)

### Tile cache

- tile แยกตาม zoom ที่ปัดเป็นขั้นกำลังสอง
- element ที่เลือกอยู่หรือกำลังลากวาดบนชั้นสดที่ซ้อนทับ tile
- มีการแก้ ทั้งจากเราหรือคนอื่น: ใช้กล่องเก่ากับกล่องใหม่ถาม index ว่าโดน tile ไหน แล้วทิ้งเฉพาะ tile เหล่านั้น
- มีเพดาน memory แบบ LRU

### Worker

- raster tile ใน `OffscreenCanvas` ใน worker
- ต้องโหลดฟอนต์ใน worker ด้วย รวม Sarabun สำหรับภาษาไทย
- Safari ยังไม่ได้เช็กว่ารองรับ 2D บน OffscreenCanvas ตั้งแต่รุ่นไหน

## ลูกศรเชื่อม shape

- `binding` เป็น record เดียว: `{ id, arrowId, terminal: start|end, targetId, anchor, mode: fixed|floating, gap }` ส่วน "shape นี้มีลูกศรอะไรผูกอยู่" ให้ signals คำนวณ
- ลูกศรเก็บแค่สิ่งที่ตั้งใจ:
  - ชนิด (ตรง, โค้ง, หักมุม), ค่าโค้ง, label
  - waypoint เฉพาะจุดที่คนดัดเอง
- `points` จริงคำนวณจากกล่องของ shape ปลายทางเป็น computed signal ผลคือ:
  - ขยับ shape แล้วไม่ต้องเขียน record ของลูกศร
  - ไม่ชนกับคนที่กำลังแก้ลูกศร
  - agent ไม่ต้องคำนวณพิกัด
- label เป็น field ของลูกศร แทน text element ที่ผูกด้วย `containerId`
- ลูกศรหักมุมใช้ Flatbush หาสิ่งกีดขวางเพื่ออ้อม
- ตัวหาเส้นทางต้องให้ผลเหมือนกันทุกเครื่อง จึงต้องอยู่ใน `ndraw` ที่ web, server และ `get_board_image` ใช้ร่วมกัน
- export เป็น `.excalidraw` หรือส่งให้ MCP แบบเดิม ให้คำนวณ `points` ออกมาตอนนั้น
- กติกาที่ต้องเขียนให้ชัด:
  - shape ปลายทางถูกลบ: ลูกศรค้างอยู่ที่ตำแหน่งเดิม หรือถูกลบตาม
  - ลูกศรผูกกับ shape ที่อยู่ใน group หรือ frame
  - คนลาก shape อยู่ แต่ agent ลบ binding ไปพร้อมกัน
  - align/distribute ต้องจัดลูกศรที่ผูกอยู่ได้ แทนการข้ามแบบตอนนี้

### สร้าง shape ต่อแบบ FigJam พร้อมเดาตำแหน่ง

เจ้าของเลือกแล้ว: ปุ่มสร้าง shape ต่อรอบ shape แบบ FigJam และ suggest แบบ ข (เดาตำแหน่ง node ถัดไป) รายละเอียดข้างล่างเป็น **ข้อเสนอ**

**ของเดิมใน Excalidraw 0.18.1** (ใช้ได้จากคีย์บอร์ดเท่านั้น)

- `FlowChartCreator`: เลือก shape หนึ่งตัว กด Cmd/Ctrl+ลูกศร จะเห็น ghost ของ shape ใหม่พร้อมลูกศร ปล่อย Cmd แล้วสร้างจริง กดซ้ำได้หลาย node
- `FlowChartNavigator`: Alt+ลูกศร กระโดดไปยัง node ที่เชื่อมกัน
- ยังไม่มีปุ่ม "+" รอบ shape ให้ใช้เมาส์หรือนิ้ว

**ปุ่มรอบ shape**

- เลือกหรือ hover shape ตัวเดียว จะมีปุ่มสี่ด้านบนชั้น interactive คำนวณจาก selection กับ geometry ไม่ลง document
- ปุ่มด้านที่ระบบเดาว่าน่าจะไปต่อจะเด่นกว่าปุ่มอื่น
- hover ปุ่ม: เห็น ghost ของ shape และลูกศรของด้านนั้น ghost เป็น session state ของคนนั้นคนเดียว ไม่ส่งให้คนอื่น
- คลิกปุ่ม: สร้าง shape พร้อมลูกศรที่ผูก binding ทั้งสองปลาย นับเป็น undo ก้อนเดียว
- ลากจากปุ่ม: ได้ลูกศรที่ยืดตามเมาส์ ใช้ Flatbush หา shape ใกล้ ๆ แล้วดูดเข้าจุดยึดกลางด้าน (`anchor`, `mode: fixed`) ถ้าปล่อยบนที่ว่าง เด้งเมนูเลือกชนิด shape ที่จะสร้างต่อ
- คีย์บอร์ด: คง Cmd+ลูกศร และ Alt+ลูกศรแบบเดิม

**เดาจากอะไร**

| เรื่อง | ใช้อะไรตัดสิน | ถ้าไม่มีข้อมูล |
| --- | --- | --- |
| ทิศ | ทิศของลูกศรที่เข้าและออกจาก shape นี้ (จาก binding) | ทิศที่ลูกศรส่วนใหญ่ในหน้าไหลไป ถ้าไม่มีอีกก็ไปทางขวา |
| ระยะห่าง | median ของระยะระหว่าง node ที่เชื่อมกันในหน้า | ค่า default ของ `FlowChartCreator` |
| ชนิด ขนาด สไตล์ | คัดลอกจาก shape ต้นทาง ถ้ามี node พี่น้องใช้ขนาดของพี่น้อง | คัดลอกจาก shape ต้นทาง |
| ชนิดลูกศร | ชนิดที่ลูกศรรอบ ๆ ใช้อยู่ (ตรงหรือหักมุม) | ค่าที่ผู้ใช้ตั้งไว้ |
| แนว | ตรงแกนกลางของ shape ต้นทาง หรือตรงขอบของ node ข้างเคียง (Flatbush) | ตรงแกนกลางของ shape ต้นทาง |
| ชนของเดิม | ถาม Flatbush ด้วยกล่องที่เดา (บวกระยะเผื่อ) ถ้าชน เลื่อนตั้งฉากกับทิศสลับซ้ายขวาทีละช่อง ถ้ายังไม่ได้ ถอยออกไปตามทิศอีกช่อง |  |

**ใน `ndraw`**

- ฟังก์ชันล้วนตัวเดียว `suggestNext(graph, index, sourceId, direction?)` คืนกล่อง ทิศ และชนิดลูกศร
- input เดิมได้ผลเดิมทุกครั้ง จึงเขียน unit test ได้ตรง ๆ
- คำนวณเฉพาะตอนเลือกหรือ hover ถาม Flatbush ไม่กี่ครั้ง
- server ใช้ฟังก์ชันเดียวกัน agent สั่ง "เพิ่ม node ต่อจาก A" โดยไม่ส่งพิกัด แล้วได้ตำแหน่งเดียวกับที่คนจะได้จากการคลิก ต่อยอดจาก tool `connect` และ `layout.ts` ที่มีอยู่

**กรณีขอบ**

- ทำเฉพาะ node ของ flowchart คือสี่เหลี่ยม เพชร วงรี (ตาม `isFlowchartNodeElement`) ไม่ทำกับ text, freedraw หรือลูกศร
- เลือกหลายตัว: ไม่แสดงปุ่ม
- shape ที่หมุน: ใช้กล่องล้อม (AABB)
- ghost อยู่นอกจอ: เลื่อนจอไปให้เห็น แบบที่ `FlowChartCreator` ทำ
- shape ต้นทางอยู่ใน frame แต่ไม่มีที่ว่างใน frame: ยังไม่ได้ตัดสิน (คำถามข้อ 10)

## ความสามารถเพิ่มจาก tldraw

1. **Tree ของ node**: อ้างถึงกิ่งทั้งกิ่งได้ เช่น "frame นี้และทุกอย่างข้างใน"
2. **Query แทนการดึงทั้งหน้า**: อ่านตามกิ่ง ตามพื้นที่ (Flatbush) ตามชนิด หรือตาม selection
3. **แก้ระดับ field พร้อมเงื่อนไข**: เช่น `{ id, expect: <rev>, set: { "props.text": "…" } }` ถ้าคนแก้ไปก่อนแล้วจะได้ conflict แทนการเขียนทับเงียบ ๆ
4. **สิทธิ์ระดับ node**: เช่น agent แก้ได้เฉพาะใน frame ที่กำหนด หรือ node ที่ติด flag ห้าม agent แตะ บังคับที่ hub
5. **Selection เป็น presence record ของแต่ละ client**: ทั้งคนและ agent MCP เห็น selection ของแต่ละคนแยกกัน และคนเห็นว่า agent กำลังจับอะไรอยู่

## MCP เป็นเพื่อนร่วมงาน (ทาง ก)

agent มาจาก AI client ที่ผู้ใช้เปิดไว้ (Claude Code, Claude Desktop ฯลฯ) server เป็นฝ่ายเรียก agent ก่อนไม่ได้

**ตัวตน**

- ผูกกับ MCP session และ API key ของคนที่พา agent เข้ามา
- ชื่อที่แสดงคือชื่อ client จาก `initialize` คู่ชื่อเจ้าของ เช่น "Claude · ของ Jirayu"
- บอร์ดเดียวมี agent หลายตัวได้

**Presence**

- มีเคอร์เซอร์, selection, viewport และสถานะ เช่น "กำลังจัด frame Login"
- ข้อเสนอ: อยู่ตราบที่ session เปิด และหายไปถ้าไม่มี tool call นานเกินกำหนด

**การเรียก agent**

- คนเลือก node แล้วเขียน comment `@Claude …`
- event แนบ selection ตอนที่เขียนไว้ด้วย

**ส่ง event ไปถึง agent**

- ข้อเสนอ: tool ที่รอแบบ long-poll เช่น `wait_for_mention`
  - คืนผลเมื่อมีคน mention หรือเมื่อสิ่งที่ agent จับอยู่ถูกแก้
  - ใช้ได้กับทุก client
- resource subscription ของ MCP ใช้เสริมได้ใน client ที่รองรับ
- ถ้าไม่มีใครเปิด agent ค้างไว้ mention จะรออยู่ใน comment

**ตอนทำงาน**

- ตั้งสถานะ
- รวมงานเป็นก้อนที่มีชื่อ เพื่อให้คน undo งานของ agent ได้ทั้งก้อนโดยไม่กระทบที่ตัวเองแก้
- ตอบใน thread เดิมว่าทำอะไรไป
- ถ้าชนหรือไม่มีสิทธิ์จะได้ error กลับไป
- ย้ายหรือจัด layout หลายตัวพร้อมกัน: ฝั่ง browser แสดงให้ของเคลื่อนไปที่ใหม่สั้น ๆ แทนการวาร์ป คนจะเห็นว่า agent เปลี่ยนอะไร เคลื่อนเฉพาะตอนแสดงผล ใน document ยังเขียนครั้งเดียว

**สิทธิ์**: ไม่เกินสิทธิ์ของเจ้าของ key และถูกจำกัดลงอีกด้วยข้อ 4

**ของเดิมที่ต้องใช้ต่อ**

- เขียนผ่าน hub เดียวกับ browser (decision 7)
- map `agents` และการ reveal ของ `focus` (decision 85)
- comment และ thread
- `get_changes`

## Optimize เพิ่มเติม

**ข้อเสนอ** เป็นเรื่องที่ทำได้เพราะ `ndraw` เขียน core เอง

### Render

- cache สิ่งที่วาดแล้วของแต่ละ element ตาม `rev` ได้แก่ shape จาก rough.js, `Path2D` ของ freedraw และ layout ของข้อความ ไม่สร้างใหม่ทุกครั้งที่ render
- ตอนลากหลายตัว ขยับทั้งชั้นด้วย matrix ของ canvas แล้วคำนวณตำแหน่งจริงตอนปล่อยเมาส์
- มี `requestAnimationFrame` loop เดียว วาดเฉพาะตอนมีอะไรเปลี่ยน งานที่รอได้ เช่นสร้าง index ใหม่ ให้ทำใน `requestIdleCallback`
- freedraw เส้นยาว: เก็บ polyline ที่ลดจุดแล้วไว้ใช้ hit test ไม่ต้องวัดระยะกับทุกจุด
- เคอร์เซอร์ของคนอื่นวาดบนชั้นของตัวเองและขยับด้วย transform ตอนนี้ `use-board-collab.ts:401` เรียก `updateScene({ collaborators })` ทุกครั้งที่ awareness เปลี่ยน แล้ว Excalidraw เรียก `setState({ collaborators })` ตาม ทำให้ `App` render ใหม่ทั้งก้อน `[INFERENCE]` 5 คน คนละ 30 ครั้งต่อวินาที ประมาณ 150 render ต่อวินาที ยังไม่ได้วัด
- ลายเส้นจากปากกา: ใช้ `getCoalescedEvents` ให้ freedraw ได้จุดครบตอนเครื่องหน่วง ใช้ `getPredictedEvents` กับ canvas `desynchronized: true` ให้เส้นตามปากกาทันขึ้น Excalidraw 0.18.1 ยังไม่ใช้ทั้งสองอย่าง

### ข้อความภาษาไทย

- `wrapText`/`parseTokens` ของ Excalidraw แยกคำด้วย regex ที่รู้จักช่องว่าง CJK และ emoji ทั้งแพ็กเกจไม่มี `Intl.Segmenter`
- `[INFERENCE]` ประโยคไทยที่ไม่มีช่องว่างจะถูกนับเป็นคำเดียว แล้ว `wrapWord` ตัดทีละตัวอักษร อาจแยกสระหรือวรรณยุกต์ออกจากพยัญชนะ ยังไม่ได้ลองพิมพ์จริง
- `ndraw` ตัดคำด้วย `Intl.Segmenter("th", { granularity: "word" })` และ cache ผล layout ตามข้อความ + ฟอนต์ + ความกว้าง

### ขนาดแพ็กเกจ

- Excalidraw 0.18.1 มีฟอนต์ 9 ชุด (13 MB รวม Xiaolai ที่เป็น CJK) และไฟล์ภาษา 1.7 MB
- `ndraw` ใส่เฉพาะฟอนต์ที่ใช้ เช่น Sarabun กับฟอนต์ลายมือหนึ่งตัว และภาษาไทย/อังกฤษ ที่เหลือโหลดตอนต้องใช้

### รูปภาพ

- decode ด้วย `createImageBitmap` นอก main thread
- โหลดเฉพาะรูปที่อยู่ในจอ (ถาม Flatbush) และคืน memory ของรูปที่ออกไปไกลแล้ว
- ทำไฟล์ขนาดย่อยฝั่ง server ไว้ใช้กับ LOD (S3 ยังไม่มี)

### เปิดบอร์ดเร็วขึ้น

- โชว์ภาพนิ่งของบอร์ดก่อน Yjs sync เสร็จ ใช้ตัว render ฝั่ง server ที่มีอยู่แล้ว (`get_board_image`: SVG builder ของตัวเอง + resvg) และ preview บน dashboard ที่มีอยู่แล้ว

### Undo/redo

- เก็บเป็นรายการสิ่งที่เปลี่ยนจาก store ไม่เก็บสำเนา element
- undo แยกตามคน และ undo งานของ agent ได้ทั้งก้อน

### การเก็บข้อมูล

- ตอนนี้ทุกครั้งที่ save จะเขียนเอกสารทั้งก้อนใหม่
- decision 79 ไม่ทำ update log + compaction เพราะย้อนกลับไม่ได้ แต่ `ndraw` ต้องแปลงข้อมูลบอร์ดทั้งหมดอยู่แล้ว จึงเป็นจังหวะเดียวที่รวมสองการตัดสินใจที่ย้อนไม่ได้นี้ไว้ในการย้ายครั้งเดียว

### ลดโค้ดซ้ำระหว่าง web กับ server

- server มีของตัวเองซ้ำกับ Excalidraw อยู่หลายชุด: adapter ของ element, layout, `bindings.ts` และ SVG builder ของ `get_board_image`
- ถ้าทั้งสองฝั่งใช้ `ndraw` ตัวเดียว จะเหลือ geometry และ renderer ชุดเดียว และภาพฝั่ง server จะตรงกับ browser

### Memory บอร์ดใหญ่

- เก็บกล่องของทุก element เป็น `Float64Array` (โครงแบบ struct-of-arrays) ใช้ร่วมกับ Flatbush และส่งให้ worker ได้โดยไม่ต้องแปลง

### ทดสอบภาพ

- rough.js ใช้ `seed` อยู่แล้ว ภาพจึงออกมาเหมือนเดิมทุกครั้ง ทำ visual regression test ของ renderer ได้ทั้งฝั่ง browser และ server

## ความสามารถใหม่ที่ `ndraw` เปิดทาง

**ข้อเสนอ** ยังไม่ได้เลือกว่าจะทำข้อไหน

- **Comment ผูกกับ node**: `add_comment` ตอนนี้รับพิกัด `x, y` ถ้าผูกกับ id ของ shape แทน comment จะย้ายตาม shape และ agent รู้ว่า comment เป็นของ node ไหน
- **Snap และเส้นช่วยจัดแนว**: ถาม Flatbush หาของที่อยู่ใกล้ ไม่วนทั้งหน้า
- **ตัวจัด layout อยู่ใน `ndraw`**: ย้าย `layout.ts` (ตัวจัด flowchart ฝั่ง server) เข้า `ndraw` ให้คนในบอร์ดกดจัด layout เองได้ ไม่ใช่แค่ agent
- **Registry ของชนิด shape**: ต่อยอดจาก `ShapeRegistry` ฝั่ง server เป็นแบบ `ShapeUtil` แต่ละชนิดประกาศ geometry, การวาด, hit test, LOD และค่า default ไว้ที่เดียว เพิ่มชนิดใหม่ได้โดยไม่แก้ core
- **Touch และปากกา**: palm rejection, pinch zoom และแรงกดของปากกา
- **Text editor บน canvas ที่รองรับ IME ภาษาไทย**: Excalidraw ใช้ textarea ซ้อนบน canvas ถ้าทำเองต้องทดสอบการพิมพ์สระและวรรณยุกต์ไทย

## ต้องมีก่อนเริ่มทำ

**ข้อเสนอ** เป็นตัวกันความเสี่ยงของการย้ายที่ย้อนกลับไม่ได้

### ปล่อยใช้งานและถอยกลับ

- เปิด `ndraw` ด้วย flag ทีละบอร์ด
- ช่วงแรกเก็บข้อมูลทั้งแบบเก่าและแบบใหม่คู่กัน แล้วเทียบผลแปลงของบอร์ดจริงทุกบอร์ดก่อนทิ้งแบบเก่า
- กำหนดเงื่อนไขที่ต้องถอยกลับไว้ล่วงหน้า

### ตัววัดในแอป

- ตัววัดแบบ `PerformanceManager` ของ tldraw: บันทึก fps และ p95 frame time ต่อการลาก แพน และเปิดบอร์ด
- ใช้พิสูจน์ว่าแต่ละขั้นในลำดับงานทำให้เร็วขึ้นจริง และตั้งเกณฑ์ไว้ใน CI

### เพดานขนาด

- decision 131 ยังค้างเรื่องเอกสาร Yjs ไม่มีเพดานขนาด
- schema ใหม่กำหนดเพดานได้ เช่นจำนวน shape ต่อหน้า (tldraw ตั้ง `maxShapesPerPage` ไว้ 4000) และขนาด `points` ต่อเส้น

### ทดสอบการแปลงไปกลับ

- property/fuzz test สุ่ม element แบบ Excalidraw แปลงเป็น record ใหม่แล้วแปลงกลับ ต้องไม่เสียข้อมูล
- MCP, import และ export ทั้งหมดพึ่งการแปลงนี้

## ลำดับงาน

**ข้อเสนอ**

1. สร้าง `ndraw` เป็น workspace package: port Excalidraw lib (ทาง 3), schema, record, migration และตัวแปลงไปกลับเป็น Excalidraw JSON
2. Store แบบ signals ที่รับการเปลี่ยนจาก Yjs
3. Flatbush พร้อมรายการตัวที่เพิ่งเปลี่ยน แล้วเปลี่ยน culling และ hit test มาใช้
4. Binding และลูกศรแบบคำนวณเส้นทาง
5. Presence: selection ของแต่ละ client, การลากผ่าน presence, ตัวตนของ agent
6. MCP: query, patch แบบมีเงื่อนไข, สิทธิ์ระดับ node, `wait_for_mention`, undo เป็นก้อน
7. LOD
8. Tile cache
9. ย้ายการสร้าง index และ raster tile ไป worker

วัดด้วย `apps/server/scripts/profile-board-open.ts` (fixture S/M/L) และ production build ก่อนและหลังทุกขั้น

## ความเสี่ยง

- **ข้อมูลเก่า**: บอร์ดเก่าทุกบอร์ดต้องแปลง client รุ่นเก่ากับ IndexedDB ที่ค้างอยู่อ่าน schema ใหม่ไม่เป็น ต้องมีเลข version ใน `meta` และล้างหรือแปลง cache เก่า
- **ย้อนกลับไม่ได้**: decision 79 ถือว่าการเปลี่ยน storage เป็นการตัดสินใจที่ย้อนกลับไม่ได้
- **ต้องเขียน editor เอง**: core แบบ signals ไปแทน `setState` ของ `App` ใน Excalidraw ซึ่ง toolbar, เมนู, dialog และ tool ทุกตัวผูกอยู่ ดูหัวข้อ "การ port Excalidraw lib"
- **ระบบที่ต้องแก้ตาม**: hub, history/restore, `get_changes`, tombstone pruning, `board_text`, GC ของไฟล์, IndexedDB, MCP และ duplicate/import/export
- **ตัวหาเส้นทางต้องให้ผลเหมือนกัน**: ถ้า browser กับ server ได้ผลต่างกัน คนจะเห็นลูกศรคนละเส้น

## คำถามที่ยังเปิด

1. งานที่อยากให้ agent ทำบ่อยที่สุดคืออะไร (วาด diagram จากคำอธิบาย, จัด layout, รีวิวและ comment) ใช้ตัดสินว่า core ต้องเปิดอะไรให้ agent ก่อน
2. Engine: A, B หรือ C
3. UI ของ Excalidraw (toolbar, เมนู, dialog, เครื่องมือ) ต้องคงหน้าตาเดิม หรือทำใหม่บน core ใหม่
4. ปัญหาที่อยากแก้ก่อน: ข้อมูลที่วิ่งตอนแก้พร้อมกัน หรือขนาดบอร์ดตอนเปิดและตอนเก็บ
5. บอร์ดใหญ่ส่วนใหญ่ถูกใช้แบบซูมเข้าทำงานทีละส่วน หรือซูมออกดูภาพรวม
6. Library ของ signals: แนะนำ `@tldraw/state`
7. ลบ shape ปลายทางแล้วลูกศรควรทำอะไร
8. presence ของ agent ควรหายไปหลังไม่มี tool call นานเท่าไร และ MCP client แต่ละตัวตัด tool call ที่รอนานทิ้งหลังกี่วินาที
9. คลิกปุ่มด้านเดิมซ้ำ ควรได้ node พี่น้องเรียงลงมาจาก shape ต้นทาง (แตกกิ่งแบบ Cmd+ลูกศรของ Excalidraw) หรือต่อเป็นสายยาวจาก node ที่เพิ่งสร้าง
10. ถ้า shape ต้นทางอยู่ใน frame และไม่มีที่ว่าง ควรวาง node ใหม่นอก frame หรือขยาย frame

## อ้างอิง

- tldraw performance: https://tldraw.dev/sdk-features/performance
- tldraw culling: https://tldraw.dev/sdk-features/culling
- tldraw issue #7425 (culling วนทุก shape): https://github.com/tldraw/tldraw/issues/7425
- license ที่เช็กจาก npm 2026-10-31:
  - MIT: `@tldraw/store`, `@tldraw/state`, `@tldraw/tlschema`, `yjs`, `loro-crdt`
  - license ของ tldraw: `@tldraw/sync-core`, `tldraw`
