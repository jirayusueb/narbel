import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type {
  INotificationRepository,
  NotificationPayload,
} from "../../../../shared/application/interfaces/INotifications";
import type {
  IOutbox,
  OutboxEvent,
  OutboxMessage,
} from "../../../../shared/application/interfaces/IOutbox";
import type {
  IProfileReader,
  Person,
} from "../../../../shared/application/interfaces/IProfiles";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { Board } from "../../domain/entities/Board";
import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import { shouldAcceptIncoming } from "../../domain/rules/mergeElement";
import type { MemberRole } from "../../domain/values/Access";
import { BoardTitle } from "../../domain/values/BoardTitle";
import type { SceneVersion } from "../../domain/values/ChangeCursor";
import { BoardAccessGuard } from "../BoardAccess";
import type { BoardTx } from "../ports/BoardTx";
import type {
  IBoardAccessRepository,
  Member,
  Share,
} from "../ports/IBoardAccessRepository";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type {
  AgentSelection,
  ElementTouch,
  IBoardScenes,
  SceneAccess,
} from "../ports/IBoardScenes";
import type { ICommentAssignees } from "../ports/ICommentActivity";
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
  findById = (id: string) => {
    const row = this.rows.get(id);
    return Promise.resolve(row && !row.trashedAt ? row : null);
  };
  findIncludingTrashed = (id: string) =>
    Promise.resolve(this.rows.get(id) ?? null);
  listByOwner = (ownerId: string) =>
    Promise.resolve(
      [...this.rows.values()].filter(
        (b) => b.ownerId === ownerId && !b.trashedAt
      )
    );
  listTrashedByOwner = (ownerId: string) =>
    Promise.resolve(
      [...this.rows.values()].filter(
        (b) => b.ownerId === ownerId && b.trashedAt
      )
    );
  listSharedWith = () => Promise.resolve([]);
  save = (board: Board) => {
    this.rows.set(board.id, board);
    return Promise.resolve();
  };
  setTrashed = (id: string, at: Date | null) => {
    const row = this.rows.get(id);
    if (!row || (row.trashedAt === null) === (at === null)) {
      return Promise.resolve(false);
    }
    this.rows.set(
      id,
      Board.restore({ ...row, title: row.title.value, trashedAt: at })
    );
    return Promise.resolve(true);
  };
  deleteTrashed = (id: string) => {
    const removable = Boolean(this.rows.get(id)?.trashedAt);
    if (removable) {
      this.rows.delete(id);
    }
    return Promise.resolve(removable);
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
    const index = this.members.findIndex(
      (m) => m.boardId === boardId && m.email === member.email
    );
    const row = { boardId, name: member.email, ...member };
    if (index === -1) {
      this.members.push(row);
    } else {
      this.members[index] = row;
    }
    return Promise.resolve();
  };
  listMemberRoles = (boardId: string) =>
    Promise.resolve(
      this.members.flatMap((m) =>
        m.boardId === boardId && m.userId
          ? [{ userId: m.userId, role: m.role }]
          : []
      )
    );
  removeMember = (boardId: string, key: string) => {
    const index = this.members.findIndex(
      (m) => m.boardId === boardId && (m.userId === key || m.email === key)
    );
    const [removed] = index === -1 ? [] : this.members.splice(index, 1);
    return Promise.resolve(
      removed ? { userId: removed.userId, email: removed.email } : null
    );
  };
  findUserIdByEmail: (email: string) => Promise<string | null> = () =>
    Promise.resolve(null);
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

export class FakeProfiles implements IProfileReader {
  readonly people = new Map<string, Person>();
  add(id: string, username: string | null = null, name = id.toUpperCase()) {
    this.people.set(id, {
      id,
      name,
      username,
      email: `${id}@x.io`,
      avatarUrl: null,
    });
  }
  findPeople = (wanted: string[]) =>
    Promise.resolve(wanted.flatMap((id) => this.people.get(id) ?? []));
  findByUsernames = (usernames: string[]) =>
    Promise.resolve(
      [...this.people.values()].filter(
        (p) => p.username !== null && usernames.includes(p.username)
      )
    );
}

export class FakeNotifications implements INotificationRepository {
  readonly sent: { userId: string; payload: NotificationPayload }[] = [];
  add = (userId: string, payload: NotificationPayload) => {
    this.sent.push({ userId, payload });
    return Promise.resolve();
  };
  deleteForBoard = (boardId: string) => {
    const keep = this.sent.filter(
      (n) => !("boardId" in n.payload && n.payload.boardId === boardId)
    );
    this.sent.splice(0, this.sent.length, ...keep);
    return Promise.resolve();
  };
  list = () => Promise.resolve({ items: [], nextCursor: null, unreadCount: 0 });
  markRead = () => Promise.resolve(0);
  kinds = (userId: string) =>
    this.sent.filter((n) => n.userId === userId).map((n) => n.payload.kind);
}

export class FakeOutbox implements IOutbox {
  readonly messages: {
    message: OutboxMessage | OutboxEvent;
    key: string | null;
  }[] = [];
  enqueue = (message: OutboxMessage, key: string) => {
    if (!this.messages.some((m) => m.key === key)) {
      this.messages.push({ message, key });
    }
    return Promise.resolve();
  };
  publish = (event: OutboxEvent) => {
    this.messages.push({ message: event, key: null });
    return Promise.resolve();
  };
  forget = (key: string) => {
    const index = this.messages.findIndex((m) => m.key === key);
    if (index !== -1) {
      this.messages.splice(index, 1);
    }
    return Promise.resolve();
  };
}

/** Runs the work directly on the fakes; there is nothing to roll back in memory. */
export class FakeUow implements IUnitOfWork<BoardTx> {
  constructor(private readonly tx: BoardTx) {}
  run = <T>(work: (tx: BoardTx) => Promise<T>) => work(this.tx);
}

export class FakeScenes implements IBoardScenes {
  readonly pageList: Page[] = [{ id: "page:main", name: "Page 1" }];
  readonly elements = new Map<string, SceneElement>();
  readonly files = new Map<
    string,
    { id: string; mimeType: string; created: number }
  >();
  discarded: string[] = [];
  evicted: string[] = [];
  selection: string[] | undefined;
  lastSelection: AgentSelection | undefined;
  touches: ElementTouch[] = [];
  version = new Uint8Array() as SceneVersion;

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
    locate: (id) => {
      for (const page of this.pageList) {
        const element = this.elements.get(`${page.id}:${id}`);
        if (element) {
          return { pageId: page.id, element };
        }
      }
      return;
    },
    ensureFile: (file) => {
      if (!this.files.has(file.id)) {
        this.files.set(file.id, file);
      }
    },
    // same merge rule as the live hub, so a write without a version bump is dropped here too
    put: (pageId, el) => {
      const key = `${pageId}:${el.id}`;
      if (shouldAcceptIncoming(this.elements.get(key), el)) {
        this.elements.set(key, el);
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

/** Accepts a proof equal to `ok:<boardId>`. */
export const fakeUnlock: IUnlockTokens = {
  issue: (boardId) => `ok:${boardId}`,
  verify: (boardId, _hash, proof) => proof === `ok:${boardId}`,
};

/** Records which members were cleared as assignee; discussion owns the threads themselves. */
export class FakeAssignees implements ICommentAssignees {
  readonly cleared: { boardId: string; userId: string }[] = [];
  clearAssignee = (boardId: string, userId: string) => {
    this.cleared.push({ boardId, userId });
    return Promise.resolve();
  };
}

export const newBoard = (id = "b1", owner = "owner") =>
  Board.create(id, owner, BoardTitle.restore("Mine"), new Date());

export const setupAccess = () => {
  const boards = new FakeBoards();
  const grants = new FakeGrants();
  const scenes = new FakeScenes();
  const comments = new FakeAssignees();
  const profiles = new FakeProfiles();
  const notifications = new FakeNotifications();
  const outbox = new FakeOutbox();
  boards.rows.set("b1", newBoard());
  const guard = new BoardAccessGuard(boards, grants, fakeUnlock);
  const uow = new FakeUow({
    boards,
    grants,
    comments,
    notifications,
    outbox,
    profiles,
  });
  return {
    boards,
    grants,
    scenes,
    comments,
    profiles,
    notifications,
    outbox,
    uow,
    guard,
  };
};
