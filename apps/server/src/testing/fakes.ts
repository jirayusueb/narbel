import { AccessPolicy } from "../features/boards/application/AccessPolicy";
import type { BoardTx } from "../features/boards/application/ports/BoardTx";
import type {
  IBoardAccessRepository,
  Member,
  ReadableBoard,
  Share,
} from "../features/boards/application/ports/IBoardAccessRepository";
import type { IBoardRepository } from "../features/boards/application/ports/IBoardRepository";
import type { IUnlockTokens } from "../features/boards/application/ports/IUnlockTokens";
import { Board } from "../features/boards/domain/entities/Board";
import type {
  MemberRole,
  Visibility,
} from "../features/boards/domain/values/Access";
import { BoardTitle } from "../features/boards/domain/values/BoardTitle";
import type { IIdGenerator } from "../shared/application/interfaces/IIdGenerator";
import type {
  INotificationRepository,
  NotificationPayload,
} from "../shared/application/interfaces/INotifications";
import type {
  IOutbox,
  OutboxEvent,
  OutboxMessage,
} from "../shared/application/interfaces/IOutbox";
import type {
  IProfileReader,
  Person,
} from "../shared/application/interfaces/IProfiles";
import type { IUnitOfWork } from "../shared/application/interfaces/IUnitOfWork";

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

class FakeBoards implements IBoardRepository {
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
  markEdited = (id: string) => Promise.resolve(this.rows.get(id)?.ownerId);
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

class FakeGrants implements IBoardAccessRepository {
  readonly members: (Member & { boardId: string })[] = [];
  share: Share | null = null;
  constructor(private readonly boards = new FakeBoards()) {}
  findGrant = (
    boardId: string,
    who: { userId: string; email: string | undefined }
  ) => {
    const m = this.members.find(
      (row) =>
        row.boardId === boardId &&
        (row.userId === who.userId || row.email === who.email)
    );
    return Promise.resolve(
      m
        ? { grantId: `${boardId}:${m.email}`, userId: m.userId, role: m.role }
        : null
    );
  };
  claim = (grantId: string, userId: string) => {
    const m = this.members.find(
      (row) => `${row.boardId}:${row.email}` === grantId
    );
    if (m && m.userId === null) {
      m.userId = userId;
    }
    return Promise.resolve();
  };
  readableBoards = (person: { id: string; email: string }) =>
    Promise.resolve(
      [...this.boards.rows.values()].flatMap((b): ReadableBoard[] => {
        const grant = this.members.find(
          (m) =>
            m.boardId === b.id &&
            (m.userId === person.id || m.email === person.email.toLowerCase())
        );
        const role = b.ownerId === person.id ? "owner" : grant?.role;
        return !b.trashedAt && role
          ? [
              {
                id: b.id,
                title: b.title.value,
                role,
                visibility: b.visibility,
                createdAt: b.createdAt,
                updatedAt: b.updatedAt,
              },
            ]
          : [];
      })
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

class FakeProfiles implements IProfileReader {
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

class FakeNotifications implements INotificationRepository {
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

class FakeOutbox implements IOutbox {
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
  /** queued emails carry a dedupe key, published events do not */
  emails = () => this.messages.filter((m) => m.key !== null);
  events = (): unknown[] =>
    this.messages.filter((m) => m.key === null).map((m) => m.message);
}

/** Runs the work directly on the fakes; there is nothing to roll back in memory. */
class FakeUow implements IUnitOfWork<BoardTx> {
  constructor(private readonly tx: BoardTx) {}
  run = <T>(work: (tx: BoardTx) => Promise<T>) => work(this.tx);
}

/** Accepts a proof equal to `ok:<boardId>`. */
export const fakeUnlock: IUnlockTokens = {
  issue: (boardId) => `ok:${boardId}`,
  verify: (boardId, _hash, proof) => proof === `ok:${boardId}`,
};

export const newBoard = (id = "b1", owner = "owner") =>
  Board.create(id, owner, BoardTitle.restore("Mine"), new Date());

export const protectedBoard = (
  visibility: Visibility,
  passwordHash: string | null,
  board = newBoard()
) => {
  const result = board.protect(visibility, passwordHash, new Date());
  if (result.isErr()) {
    throw new Error(result.error.message);
  }
  return result.value;
};

export const setupAccess = () => {
  const boards = new FakeBoards();
  const grants = new FakeGrants(boards);
  const profiles = new FakeProfiles();
  const notifications = new FakeNotifications();
  const outbox = new FakeOutbox();
  boards.rows.set("b1", newBoard());
  const policy = new AccessPolicy(boards, grants, fakeUnlock);
  const uow = new FakeUow({
    boards,
    grants,
    notifications,
    outbox,
    profiles,
  });
  return {
    boards,
    grants,
    profiles,
    notifications,
    outbox,
    uow,
    policy,
  };
};
