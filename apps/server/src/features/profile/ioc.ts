import type { Database } from "@narbel/db";
import { Elysia } from "elysia";

import type { IFileStorage } from "../../shared/application/interfaces/IFileStorage";
import { UuidGenerator } from "../../shared/infrastructure/ids/UuidGenerator";
import { DrizzleProfileRepository } from "../../shared/infrastructure/profile/DrizzleProfileRepository";
import type { BetterAuthPlugin } from "../auth";
import { ProfileUseCases } from "./application/usecases/ProfileUseCases";
import { createProfileController } from "./presentation/http/ProfileController";

export interface ProfileDeps {
  db: Database;
  storage: IFileStorage;
  /** where `/api/users/:id/avatar` is reachable from browsers */
  apiOrigin: string;
  betterAuth: BetterAuthPlugin;
}

export const createProfileModule = ({
  db,
  storage,
  apiOrigin,
  betterAuth,
}: ProfileDeps) =>
  new Elysia({ name: "feature/profile" }).use(
    createProfileController(
      betterAuth,
      new ProfileUseCases(
        new DrizzleProfileRepository(db, apiOrigin),
        storage,
        new UuidGenerator()
      )
    )
  );
