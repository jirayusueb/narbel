import type { AppError } from "../../../../shared/kernel/errors/app-error";
import { err, okEmpty } from "../../../../shared/kernel/types/result";
import type { Result } from "../../../../shared/kernel/types/result";
import { LibraryRules } from "../../domain/rules/library-rules";
import type { ILibraryRepository } from "../ports/i-library-repository";

export class SaveLibrary {
  constructor(private readonly library: ILibraryRepository) {}

  async execute(input: {
    userId: string;
    libraryItems: unknown[];
  }): Promise<Result<void, AppError>> {
    const valid = LibraryRules.validateLibraryItems(input.libraryItems);
    if (valid.isErr()) {
      return err(valid.error);
    }
    await this.library.save(input.userId, input.libraryItems);
    return okEmpty();
  }
}
