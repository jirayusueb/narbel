import { Page } from "../../domain/entities/page";
import { MergeElement } from "../../domain/rules/merge-element";
import type { SceneVersion } from "../../domain/values/change-cursor";
import type { ExcalidrawElement } from "../dtos/excalidraw-element";
import { toElement, toExcalidraw } from "../dtos/excalidraw-element";
import type {
  AgentSelection,
  ElementTouch,
  IBoardScenes,
  SceneAccess,
} from "../ports/i-board-scenes";

/** The live document in memory, with the hub's merge rule. */
export class FakeScenes implements IBoardScenes {
  readonly pageList: Page[] = [Page.create("page:main", "Page 1")];
  /** elements as the shared document stores them */
  readonly elements = new Map<string, ExcalidrawElement>();
  readonly files = new Map<
    string,
    { id: string; mimeType: string; created: number }
  >();
  discarded: string[] = [];
  evicted: string[] = [];
  selection: string[] | null = null;
  lastSelection: AgentSelection | undefined;
  touches: ElementTouch[] = [];
  version = new Uint8Array() as SceneVersion;

  private readonly access: SceneAccess = {
    pages: () => this.pageList,
    addPage: (page) => {
      this.pageList.push(page);
    },
    renamePage: (id, name) => {
      const index = this.pageList.findIndex((p) => p.id === id);
      if (index !== -1) {
        this.pageList[index] = Page.create(id, name);
      }
      return index !== -1;
    },
    removePage: (id) => {
      const index = this.pageList.findIndex((p) => p.id === id);
      this.pageList.splice(index, 1);
      return index !== -1;
    },
    get: (pageId, id) => {
      const stored = this.elements.get(`${pageId}:${id}`);
      return stored ? toElement(stored) : null;
    },
    all: (pageId) =>
      [...this.elements.entries()]
        .filter(([key]) => key.startsWith(`${pageId}:`))
        .map(([, el]) => toElement(el)),
    locate: (id) => {
      for (const page of this.pageList) {
        const stored = this.elements.get(`${page.id}:${id}`);
        if (stored) {
          return { pageId: page.id, element: toElement(stored) };
        }
      }
      return null;
    },
    ensureFile: (file) => {
      if (!this.files.has(file.id)) {
        this.files.set(file.id, file);
      }
    },
    // same merge rule as the live hub, so a write without a version bump is dropped here too
    put: (pageId, el) => {
      const key = `${pageId}:${el.id}`;
      if (MergeElement.shouldAcceptIncoming(this.elements.get(key), el)) {
        this.elements.set(key, toExcalidraw(el));
      }
    },
    changesSince: () => ({ touches: this.touches, version: this.version }),
  };

  transact = <T>(_: string, fn: (scene: SceneAccess) => T) =>
    Promise.resolve(fn(this.access));
  getSelection = () => Promise.resolve(this.selection);
  setSelection = (_: string, selected: AgentSelection) => {
    this.selection = selected.ids;
    this.lastSelection = selected;
    return Promise.resolve();
  };
  discard = (id: string) => {
    this.discarded.push(id);
    return Promise.resolve();
  };
  evict = (id: string) => {
    this.evicted.push(id);
    return Promise.resolve();
  };
}
