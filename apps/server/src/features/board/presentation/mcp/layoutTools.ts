import { z } from "zod";

import { boardId, elementId, reply } from "./toolKit";
import type { ToolRegistrar } from "./toolKit";

const ids = (min: number) =>
  z
    .array(elementId)
    .min(min)
    .max(500)
    .describe(
      "Element ids on one page; a label id stands for its shape, deleted elements are an error"
    );

const SKIPS =
  "Locked elements and connectors bound to shapes are not moved (connectors follow their shapes); they come back in `skipped` with a reason. A group moves as one unit (its other members join the selection), and a unit with any locked member is skipped whole. Running it again on an arranged selection moves nothing.";

export const registerLayoutTools: ToolRegistrar = (server, uc, actor) => {
  server.registerTool(
    "group_elements",
    {
      description:
        "Group elements so browsers select and drag them together. Returns the group id and the grouped ids; grouping the exact set that is already a group returns it unchanged. Locked elements are left out and listed in `locked`.",
      inputSchema: { boardId, ids: ids(2) },
    },
    async (input) => reply(await uc.groupElements.group({ actor, ...input }))
  );
  server.registerTool(
    "ungroup_elements",
    {
      description:
        "Dissolve the outermost group of each given element for every member of that group, as Excalidraw's ungroup does. Returns the removed group ids (empty when nothing was grouped).",
      inputSchema: { boardId, ids: ids(1) },
    },
    async (input) => reply(await uc.groupElements.ungroup({ actor, ...input }))
  );
  server.registerTool(
    "align_elements",
    {
      description: `Align elements to an edge or center of their combined bounds, like Excalidraw's align menu. ${SKIPS} Returns {moved, skipped}.`,
      inputSchema: {
        boardId,
        ids: ids(2),
        edge: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
      },
    },
    async ({ edge, ...input }) =>
      reply(
        await uc.arrangeElements.execute({
          actor,
          how: { kind: "align", edge },
          ...input,
        })
      )
  );
  server.registerTool(
    "distribute_elements",
    {
      description: `Space elements so the gaps between neighbours are equal along an axis; the two outermost stay put. ${SKIPS} Returns {moved, skipped}.`,
      inputSchema: {
        boardId,
        ids: ids(3),
        axis: z.enum(["horizontal", "vertical"]),
      },
    },
    async ({ axis, ...input }) =>
      reply(
        await uc.arrangeElements.execute({
          actor,
          how: { kind: "distribute", axis },
          ...input,
        })
      )
  );
};
