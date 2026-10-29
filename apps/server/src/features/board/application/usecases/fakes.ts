import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import { Board } from "../../domain/entities/Board";
import type { Comment } from "../../domain/entities/Comment";
import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import type { MemberRole } from "../../domain/values/Access";
import { BoardTitle } from "../../domain/values/BoardTitle";
import { BoardAccessGuard } from "../BoardAccess";
import type {
  IBoardAccessRepository,
  Member,
  Share,
} from "../ports/IBoardAccessRepository";
import type { IBoardCommentRepository } from "../ports/IBoardCommentRepository";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IBoardScenes, SceneAccess } from "../ports/IBoardScenes";
import type { IUnlockTokens } from "../ports/IUnlockTokens";

let counter = 0;
export const ids: IIdGenerator = {
  generate: () => {
    counter += 1;
    return `id${counter}`;
  },
  int: () => {
    counter += 1;
    return counter;
  },
  token: () => "t".repeat(43),
};

export class FakeBoards implements IBoardRepository {
  readonly rows = new Map<string, Board>();
  findById = (id: string) => Promise.resolve(this.rows.get(id) ?? null);
  listByOwner = (ownerId: string) =>
    Promise.resolve(
      [...this.rows.values()].filter((b) => b.ownerId === ownerId)
    );
  listSharedWith = () => Promise.resolve([]);
  save = (board: Board) => {
    this.rows.set(board.id, board);
    return Promise.resolve();
  };
  delete = (id: string) => {
    this.rows.delete(id);
    return Promise.resolve();
  };
}

export class FakeGrants implements IBoardAccessRepository {
  readonly members: (Member & { boardId: string })[] = [];
  share: Share | null = null;
  findMemberRole = (
    boardId: string,
    who: { userId: string; email: string | undefined }
  ) =>
    Promise.resolve(
      this.members.find(
        (m) =>
          m.boardId === boardId &&
          (m.userId === who.userId || m.email === who.email)
      )?.role ?? null
    );
  listMembers = (boardId: string) =>
    Promise.resolve(this.members.filter((m) => m.boardId === boardId));
  upsertMember = (
    boardId: string,
    member: { email: string; userId: string | null; role: MemberRole }
  ) => {
    this.members.push({ boardId, name: member.email, ...member });
    return Promise.resolve();
  };
  removeMember = (boardId: string, key: string) => {
    const index = this.members.findIndex(
      (m) => m.boardId === boardId && (m.userId === key || m.email === key)
    );
    if (index !== -1) {
      this.members.splice(index, 1);
    }
    return Promise.resolve(index !== -1);
  };
  findUserIdByEmail = () => Promise.resolve(null);
  findShare = () => Promise.resolve(this.share);
  saveShare = (share: Share) => {
    this.share = share;
    return Promise.resolve();
  };
  deleteShare = () => {
    this.share = null;
    return Promise.resolve();
  };
}

export class FakeComments implements IBoardCommentRepository {
  readonly rows = new Map<string, Comment>();
  list = (boardId: string, pageId?: string) =>
    Promise.resolve(
      [...this.rows.values()].filter(
        (c) =>
          c.boardId === boardId && (pageId === undefined || c.pageId === pageId)
      )
    );
  findById = (boardId: string, id: string) => {
    const row = this.rows.get(id);
    return Promise.resolve(row?.boardId === boardId ? row : null);
  };
  save = (comment: Comment) => {
    this.rows.set(comment.id, comment);
    return Promise.resolve();
  };
  delete = (_: string, id: string) => {
    this.rows.delete(id);
    return Promise.resolve();
  };
}

export class FakeScenes implements IBoardScenes {
  readonly pageList: Page[] = [{ id: "page:main", name: "Page 1" }];
  readonly elements = new Map<string, SceneElement>();
  discarded: string[] = [];
  selection: string[] | undefined;

  private readonly access: SceneAccess = {
    pages: () => this.pageList,
    addPage: (page) => {
      this.pageList.push(page);
    },
    renamePage: (id, name) => {
      const page = this.pageList.find((p) => p.id === id);
      if (page) {
        page.name = name;
      }
      return Boolean(page);
    },
    removePage: (id) => {
      const index = this.pageList.findIndex((p) => p.id === id);
      this.pageList.splice(index, 1);
      return index !== -1;
    },
    get: (pageId, id) => this.elements.get(`${pageId}:${id}`),
    all: (pageId) =>
      [...this.elements.entries()]
        .filter(([key]) => key.startsWith(`${pageId}:`))
        .map(([, el]) => el),
    find: (id) => {
      for (const page of this.pageList) {
        const element = this.elements.get(`${page.id}:${id}`);
        if (element) {
          return { pageId: page.id, element };
        }
      }
      return;
    },
    put: (pageId, el) => {
      this.elements.set(`${pageId}:${el.id}`, el);
    },
  };

  transact = <T>(_: string, fn: (scene: SceneAccess) => T) =>
    Promise.resolve(fn(this.access));
  getSelection = () => Promise.resolve(this.selection);
  setSelection = (_: string, selected: string[]) => {
    this.selection = selected;
    return Promise.resolve();
  };
  discard = (id: string) => {
    this.discarded.push(id);
    return Promise.resolve();
  };
}

/** Accepts a proof equal to `ok:<boardId>`. */
export const fakeUnlock: IUnlockTokens = {
  issue: (boardId) => `ok:${boardId}`,
  verify: (boardId, _hash, proof) => proof === `ok:${boardId}`,
};

export const newBoard = (id = "b1", owner = "owner") =>
  Board.create(id, owner, BoardTitle.restore("Mine"), new Date());

export const setupAccess = () => {
  const boards = new FakeBoards();
  const grants = new FakeGrants();
  const scenes = new FakeScenes();
  const comments = new FakeComments();
  boards.rows.set("b1", newBoard());
  const guard = new BoardAccessGuard(boards, grants, fakeUnlock);
  return { boards, grants, scenes, comments, guard };
};
