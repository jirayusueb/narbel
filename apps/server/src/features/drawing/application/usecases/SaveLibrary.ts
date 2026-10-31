import type { AppError } from "../../../../shared/kernel/errors/AppError";
import { err, okEmpty } from "../../../../shared/kernel/types/Result";
import type { Result } from "../../../../shared/kernel/types/Result";
import { validateLibraryItems } from "../../domain/rules/LibraryRules";
import type { ILibraryRepository } from "../ports/ILibraryRepository";

export class SaveLibrary {
  constructor(private readonly library: ILibraryRepository) {}

  async execute(input: {
    userId: string;
    libraryItems: unknown[];
  }): Promise<Result<void, AppError>> {
    const valid = validateLibraryItems(input.libraryItems);
    if (valid.isErr()) {
      return err(valid.error);
    }
    await this.library.save(input.userId, input.libraryItems);
    return okEmpty();
  }
}
