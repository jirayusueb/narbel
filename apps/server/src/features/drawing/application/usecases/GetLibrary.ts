import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { ok } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import type { ILibraryRepository } from "../ports/ILibraryRepository";

export class GetLibrary {
  constructor(private readonly library: ILibraryRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<{ libraryItems: unknown[] }, AppError>> {
    return ok({ libraryItems: (await this.library.find(input.userId)) ?? [] });
  }
}
