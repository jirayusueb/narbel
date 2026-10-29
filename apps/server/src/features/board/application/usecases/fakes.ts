import type { IIdGenerator } from "../../../../shared/application/interfaces/IIdGenerator";
import type {
  INotificationRepository,
  NotificationPayload,
} from "../../../../shared/application/interfaces/INotifications";
import type {
  IOutbox,
  OutboxMessage,
} from "../../../../shared/application/interfaces/IOutbox";
import type {
  IProfileReader,
  Person,
} from "../../../../shared/application/interfaces/IProfiles";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import type { Cursor } from "../../../../shared/kernel/types/Cursor";
import { Board } from "../../domain/entities/Board";
import type { Comment } from "../../domain/entities/Comment";
import type { Page } from "../../domain/entities/Page";
import type { SceneElement } from "../../domain/entities/SceneElement";
import type { MemberRole } from "../../domain/values/Access";
import { BoardTitle } from "../../domain/values/BoardTitle";
import { BoardAccessGuard } from "../BoardAccess";
import type { BoardTx } from "../ports/BoardTx";
import type {
  IBoardAccessRepository,
  Member,
  Share,
} from "../ports/IBoardAccessRepository";
import type {
  CommentView,
  IBoardCommentRepository,
  ReactionSummary,
  ThreadQuery,
} from "../ports/IBoardCommentRepository";
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
    return Promise.resolve(removed ? { userId: removed.userId } : null);
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

export class FakeComments implements IBoardCommentRepository {
  readonly rows = new Map<string, Comment>();
  readonly reactions: { commentId: string; userId: string; emoji: string }[] =
    [];
  findById = (boardId: string, id: string) => {
    const row = this.rows.get(id);
    return Promise.resolve(row?.boardId === boardId ? row : null);
  };
  private viewOf(comment: Comment, viewerId?: string): CommentView {
    const tally = new Map<string, ReactionSummary>();
    for (const r of this.reactions.filter((x) => x.commentId === comment.id)) {
      const entry = tally.get(r.emoji) ?? {
        emoji: r.emoji,
        count: 0,
        mine: false,
      };
      tally.set(r.emoji, {
        ...entry,
        count: entry.count + 1,
        mine: entry.mine || r.userId === viewerId,
      });
    }
    return {
      comment,
      replyCount: [...this.rows.values()].filter(
        (c) => c.parentId === comment.id
      ).length,
      reactions: [...tally.values()],
    };
  }
  view = async (boardId: string, id: string, viewerId?: string) => {
    const comment = await this.findById(boardId, id);
    return comment ? this.viewOf(comment, viewerId) : null;
  };
  listThreads = (q: ThreadQuery) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter(
          (c) =>
            c.boardId === q.boardId &&
            c.parentId === null &&
            (q.pageId === undefined || c.pageId === q.pageId) &&
            (q.status === "all" ||
              (q.status === "open") === (c.resolvedAt === null))
        )
        .toSorted(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            b.id.localeCompare(a.id)
        )
        .filter(
          (c) =>
            !q.after ||
            c.createdAt.getTime() < q.after.at.getTime() ||
            (c.createdAt.getTime() === q.after.at.getTime() &&
              c.id < q.after.id)
        )
        .slice(0, q.limit)
        .map((c) => this.viewOf(c, q.viewerId))
    );
  listReplies = (q: {
    boardId: string;
    threadId: string;
    after: Cursor | null;
    limit: number;
    viewerId?: string;
  }) =>
    Promise.resolve(
      [...this.rows.values()]
        .filter((c) => c.boardId === q.boardId && c.parentId === q.threadId)
        .toSorted(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id)
        )
        .filter(
          (c) =>
            !q.after ||
            c.createdAt.getTime() > q.after.at.getTime() ||
            (c.createdAt.getTime() === q.after.at.getTime() &&
              c.id > q.after.id)
        )
        .slice(0, q.limit)
        .map((c) => this.viewOf(c, q.viewerId))
    );
  save = (comment: Comment) => {
    this.rows.set(comment.id, comment);
    return Promise.resolve();
  };
  delete = (_: string, id: string) => {
    this.rows.delete(id);
    return Promise.resolve();
  };
  addReaction = (commentId: string, userId: string, emoji: string) => {
    if (
      !this.reactions.some(
        (r) =>
          r.commentId === commentId && r.userId === userId && r.emoji === emoji
      )
    ) {
      this.reactions.push({ commentId, userId, emoji });
    }
    return Promise.resolve();
  };
  removeReaction = (commentId: string, userId: string, emoji: string) => {
    const index = this.reactions.findIndex(
      (r) =>
        r.commentId === commentId && r.userId === userId && r.emoji === emoji
    );
    if (index !== -1) {
      this.reactions.splice(index, 1);
    }
    return Promise.resolve();
  };
  clearAssignee = (boardId: string, userId: string) => {
    for (const [id, c] of this.rows) {
      if (c.boardId === boardId && c.assigneeId === userId) {
        this.rows.set(id, { ...c, assigneeId: null });
      }
    }
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
  readonly messages: { message: OutboxMessage; key: string }[] = [];
  enqueue = (message: OutboxMessage, key: string) => {
    if (!this.messages.some((m) => m.key === key)) {
      this.messages.push({ message, key });
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
