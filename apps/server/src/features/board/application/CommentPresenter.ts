import { toUserRef } from "../../../shared/application/interfaces/IProfiles";
import type { IProfileReader } from "../../../shared/application/interfaces/IProfiles";
import { AppError } from "../../../shared/kernel/errors/AppError";
import { encodeCursor } from "../../../shared/kernel/types/Cursor";
import { err, ok } from "../../../shared/kernel/types/Result";
import type { Result } from "../../../shared/kernel/types/Result";
import { referencedUserIds, toCommentDto } from "./dtos/CommentDto";
import type { CommentDto, Paged } from "./dtos/CommentDto";
import type {
  CommentView,
  IBoardCommentRepository,
} from "./ports/IBoardCommentRepository";

export const presentComments = async (
  views: CommentView[],
  profiles: IProfileReader
): Promise<CommentDto[]> => {
  const found = await profiles.findPeople(referencedUserIds(views));
  const people = new Map(found.map((person) => [person.id, toUserRef(person)]));
  return views.map((view) => toCommentDto(view, people));
};

/** Reads a comment back (inside the caller's transaction when given its repositories) as the client sees it. */
export const presentOne = async (
  comments: IBoardCommentRepository,
  profiles: IProfileReader,
  boardId: string,
  id: string,
  viewerId: string
): Promise<Result<CommentDto, AppError>> => {
  const view = await comments.view(boardId, id, viewerId);
  if (!view) {
    return err(AppError.notFound("Comment"));
  }
  const [dto] = await presentComments([view], profiles);
  return dto ? ok(dto) : err(AppError.internal());
};

/** `views` holds up to `limit + 1` rows: the extra one only proves another page exists. */
export const presentPage = async (
  views: CommentView[],
  limit: number,
  profiles: IProfileReader
): Promise<Paged<CommentDto>> => {
  const pageViews = views.slice(0, limit);
  const last = pageViews.at(-1)?.comment;
  return {
    items: await presentComments(pageViews, profiles),
    nextCursor:
      views.length > limit && last
        ? encodeCursor({ at: last.createdAt, id: last.id })
        : null,
  };
};
