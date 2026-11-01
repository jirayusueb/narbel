import { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { IAttemptLimiter } from "../ports/i-attempt-limiter";
import type { IBoardRepository } from "../ports/i-board-repository";
import type { IPasswordHasher } from "../ports/i-password-hasher";
import type { IUnlockTokens } from "../ports/i-unlock-tokens";

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
    if (await this.limiter.isBlocked(input.attemptKey)) {
      return err(AppError.forbidden("Too many attempts, try again later"));
    }
    if (!(await this.hasher.verify(input.password, board.passwordHash))) {
      await this.limiter.recordFailure(input.attemptKey);
      return err(AppError.forbidden("Wrong password"));
    }
    return ok({ proof: this.tokens.issue(board.id, board.passwordHash) });
  }
}
