import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { Extension } from "@tiptap/react";

export interface MentionQuery {
  query: string;
  from: number;
  to: number;
  left: number;
  top: number;
}

export interface Mentionable {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

const TRIGGER = /(?:^|\s)@(?<query>[a-z0-9_]{0,20})$/u;
const TOKEN = /(?<![\w@])@[a-z0-9_]{3,20}\b/gu;

const readQuery = (view: EditorView): MentionQuery | null => {
  const { $from, empty } = view.state.selection;
  if (!(empty && view.hasFocus())) {
    return null;
  }
  const before = $from.parent.textBetween(
    0,
    $from.parentOffset,
    undefined,
    "\uFFFC"
  );
  const query = TRIGGER.exec(before)?.groups?.query;
  if (query === undefined) {
    return null;
  }
  const to = $from.pos;
  const caret = view.coordsAtPos(to);
  return {
    query,
    from: to - query.length - 1,
    to,
    left: caret.left,
    top: caret.bottom,
  };
};

export const MentionHighlight = Extension.create({
  name: "mentionHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: ({ doc }) => {
            const found: Decoration[] = [];
            doc.descendants((node, pos) => {
              for (const match of node.text?.matchAll(TOKEN) ?? []) {
                found.push(
                  Decoration.inline(
                    pos + match.index,
                    pos + match.index + match[0].length,
                    { class: "rounded-[5px] bg-muted px-0.5 font-medium" }
                  )
                );
              }
            });
            return DecorationSet.create(doc, found);
          },
        },
      }),
    ];
  },
});

export const MentionSuggest = Extension.create<{
  onQuery: (query: MentionQuery | null) => void;
}>({
  name: "mentionSuggest",
  addProseMirrorPlugins() {
    const { onQuery } = this.options;
    return [
      new Plugin({
        view: () => ({
          update: (view) => onQuery(readQuery(view)),
          destroy: () => onQuery(null),
        }),
      }),
    ];
  },
});
