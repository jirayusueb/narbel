import { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { IAttemptLimiter } from "../ports/IAttemptLimiter";
import type { IBoardRepository } from "../ports/IBoardRepository";
import type { IPasswordHasher } from "../ports/IPasswordHasher";
import type { IUnlockTokens } from "../ports/IUnlockTokens";

export class UnlockBoard {
  constructor(
    private readonly boards: IBoardRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: IUnlockTokens,
    private readonly limiter: IAttemptLimiter
  ) {}

  /** `attemptKey` is board + client address; the proof is the cookie value to set. */
  async execute(input: {
    boardId: string;
    password: string;
    attemptKey: string;
  }): Promise<Result<{ proof: string }, AppError>> {
    const board = await this.boards.findById(input.boardId);
    if (
      !board ||
      board.visibility !== "password" ||
      board.passwordHash === null
    ) {
      return err(AppError.notFound("Board"));
    }
    if (this.limiter.isBlocked(input.attemptKey)) {
      return err(AppError.forbidden("Too many attempts, try again later"));
    }
    if (!(await this.hasher.verify(input.password, board.passwordHash))) {
      this.limiter.recordFailure(input.attemptKey);
      return err(AppError.forbidden("Wrong password"));
    }
    return ok({ proof: this.tokens.issue(board.id, board.passwordHash) });
  }
}
