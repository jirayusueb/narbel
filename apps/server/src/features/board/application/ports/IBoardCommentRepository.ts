import type { Comment } from "../../domain/entities/Comment";

export interface IBoardCommentRepository {
  list(boardId: string, pageId?: string): Promise<Comment[]>;
  findById(boardId: string, id: string): Promise<Comment | null>;
  save(comment: Comment): Promise<void>;
  delete(boardId: string, id: string): Promise<void>;
}
