import type { AppError } from "../../../../shared/kernel/errors/app-error";
import { ok } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import type { ILibraryRepository } from "../ports/i-library-repository";

export class GetLibrary {
  constructor(private readonly library: ILibraryRepository) {}

  async execute(input: {
    userId: string;
  }): Promise<Result<{ libraryItems: unknown[] }, AppError>> {
    return ok({ libraryItems: (await this.library.find(input.userId)) ?? [] });
  }
}
