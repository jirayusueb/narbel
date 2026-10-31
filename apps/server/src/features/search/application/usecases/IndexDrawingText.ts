import type { DrawingEvent } from "../../../../shared/application/events/DrawingEvent";
import type { IUnitOfWork } from "../../../../shared/application/interfaces/IUnitOfWork";
import { SEARCH_CONSUMER } from "../ports/SearchTx";
import type { SearchTx } from "../ports/SearchTx";

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
