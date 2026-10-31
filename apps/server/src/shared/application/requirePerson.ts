import { AppError } from "../kernel/errors/AppError";
import { err, ok } from "../kernel/types/Result";
import type { Result } from "../kernel/types/Result";
import type { IProfileReader, Person } from "./interfaces/IProfiles";

/** The signed-in person behind `userId`; any context that acts in a person's name starts here. */
export const requirePerson = async (
  profiles: IProfileReader,
  userId: string | undefined
): Promise<Result<Person, AppError>> => {
  const [person] = userId ? await profiles.findPeople([userId]) : [];
  return person ? ok(person) : err(AppError.unauthorized());
};
