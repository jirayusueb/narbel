import { Elysia, t } from "elysia";

import {
  asWire,
  resultPlugin,
} from "../../../../shared/presentation/plugins/resultPlugin";
import type { BetterAuthPlugin } from "../../../auth";
import type { SearchUseCases } from "../../ioc";

export const createSearchController = (
  betterAuth: BetterAuthPlugin,
  uc: SearchUseCases
) =>
  // same path as before search had its own context; the static segment wins over boards' /:id
  new Elysia({ name: "search/http", prefix: "/api/boards" })
    .use(betterAuth)
    .use(resultPlugin)
    .get(
      "/search",
      { auth: true, query: t.Object({ q: t.String() }) },
      async ({ user, query }) =>
        asWire(
          await uc.searchBoards.execute({
            userId: user.id,
            email: user.email,
            q: query.q,
          })
        )
    );
