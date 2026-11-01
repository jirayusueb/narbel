import type { DrawingEvent } from "../../../../shared/application/events/drawing-event";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/i-unit-of-work";
import { SEARCH_CONSUMER } from "../ports/search-tx";
import type { SearchTx } from "../ports/search-tx";

/** Mirrors a board's text set from drawing, once per event; an older set than the one applied is ignored. */
export class IndexDrawingText {
  constructor(private readonly uow: IUnitOfWork<SearchTx>) {}

  async execute(eventId: string, event: DrawingEvent): Promise<void> {
    await this.uow.run(async (tx) => {
      if (await tx.processed.claim(SEARCH_CONSUMER, eventId)) {
        await tx.texts.replace(
          event.boardId,
          new Date(event.savedAt),
          event.texts
        );
      }
    });
  }
}
