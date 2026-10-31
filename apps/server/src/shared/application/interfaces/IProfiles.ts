/** What every client shows for a person. */
export interface UserRef {
  id: string;
  name: string;
  username: string | null;
  /** absolute url, cache-busted per upload; null renders the generated avatar */
  avatarUrl: string | null;
}

export interface Person extends UserRef {
  email: string;
}

export const toUserRef = ({ email: _email, ...ref }: Person): UserRef => ref;

export type UsernameOutcome = "ok" | "taken" | "already-set";

export interface IProfileReader {
  findPeople(ids: string[]): Promise<Person[]>;
  findByUsernames(usernames: string[]): Promise<Person[]>;
}

/** Exact match on the stored (lowercase) email. */
export interface IProfileEmails {
  findByEmails(emails: string[]): Promise<Person[]>;
}

export interface IProfileRepository extends IProfileReader, IProfileEmails {
  findPerson(id: string): Promise<Person | null>;
  avatarKeyOf(userId: string): Promise<string | null>;
  isUsernameFree(username: string): Promise<boolean>;
  /** Sets the username exactly once; it can never change afterwards. */
  claimUsername(userId: string, username: string): Promise<UsernameOutcome>;
  setName(userId: string, name: string): Promise<void>;
  setAvatarKey(userId: string, key: string | null): Promise<void>;
}
