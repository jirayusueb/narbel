import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/result-plugin";
import type { BetterAuthPlugin } from "../../../auth";
import { LibraryRules } from "../../domain/rules/library-rules";
import type { DrawingUseCases } from "../../ioc";

export const createLibraryController = (
  betterAuth: BetterAuthPlugin,
  uc: DrawingUseCases
) =>
  new Elysia({ name: "board/library", prefix: "/api/library" })
    .use(betterAuth)
    .use(resultPlugin)
    .get("/", { auth: true }, async ({ user }) =>
      asWire(await uc.getLibrary.execute({ userId: user.id }))
    )
    .put(
      "/",
      {
        auth: true,
        // t.Record keeps every item field; a declared t.Object would strip status, created and name
        body: t.Object({
          libraryItems: t.Array(t.Record(t.String(), t.Unknown()), {
            maxItems: LibraryRules.MAX_LIBRARY_ITEMS,
          }),
        }),
      },
      async ({ user, body, set }) => {
        set.status = 204;
        return asWire(
          await uc.saveLibrary.execute({
            userId: user.id,
            libraryItems: body.libraryItems,
          })
        );
      }
    );
