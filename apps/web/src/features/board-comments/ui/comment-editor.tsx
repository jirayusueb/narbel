import { Button } from "@narbel/ui/components/button";
import { Input } from "@narbel/ui/components/input";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold, Code, Heading2, Italic, Link2, List } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { UserAvatar } from "@/entities/user";

import { fromMarkdown, toMarkdown } from "../model/markdown";
import {
  EmptyPlaceholder,
  MentionHighlight,
  MentionSuggest,
} from "../model/mention";
import type { Mentionable, MentionQuery } from "../model/mention";
import { useMention } from "../model/use-mention";

export const MAX_BODY = 2000;

const starter = StarterKit.configure({ link: { openOnClick: false } });

const proseClass =
  "text-sm [&_a]:underline [&_a]:underline-offset-2 [&_code]:bg-muted [&_code]:font-mono [&_code]:text-[13px] [&_code]:rounded-[5px] [&_code]:px-1 [&_h2]:text-sm [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:bg-muted [&_pre]:rounded-[10px] [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[13px] [&_ul]:list-disc [&_ul]:pl-5 [&_p.is-empty]:before:pointer-events-none [&_p.is-empty]:before:float-left [&_p.is-empty]:before:h-0 [&_p.is-empty]:before:text-subtle-foreground [&_p.is-empty]:before:content-[attr(data-placeholder)] outline-hidden";

const Tool = ({
  label,
  active,
  onPress,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) => (
  <Button
    variant={active ? "secondary" : "ghost"}
    size="icon-xs"
    aria-label={label}
    onPress={onPress}
  >
    {children}
  </Button>
);

const Toolbar = ({
  editor,
  onLink,
}: {
  editor: Editor;
  onLink: () => void;
}) => (
  <div className="flex gap-0.5">
    <Tool
      label="Bold"
      active={editor.isActive("bold")}
      onPress={() => editor.chain().focus().toggleBold().run()}
    >
      <Bold />
    </Tool>
    <Tool
      label="Italic"
      active={editor.isActive("italic")}
      onPress={() => editor.chain().focus().toggleItalic().run()}
    >
      <Italic />
    </Tool>
    <Tool
      label="Heading"
      active={editor.isActive("heading")}
      onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
    >
      <Heading2 />
    </Tool>
    <Tool
      label="Bullet list"
      active={editor.isActive("bulletList")}
      onPress={() => editor.chain().focus().toggleBulletList().run()}
    >
      <List />
    </Tool>
    <Tool
      label="Code"
      active={editor.isActive("code")}
      onPress={() => editor.chain().focus().toggleCode().run()}
    >
      <Code />
    </Tool>
    <Tool label="Link" active={editor.isActive("link")} onPress={onLink}>
      <Link2 />
    </Tool>
  </div>
);

const MentionList = ({
  at,
  matches,
  active,
  onPick,
}: {
  at: MentionQuery;
  matches: Mentionable[];
  active: number;
  onPick: (member: Mentionable) => void;
}) => (
  <ul
    aria-label="Mention a member"
    className="bg-popover text-popover-foreground shadow-elevated ring-border fixed z-50 flex w-60 flex-col gap-0.5 rounded-[15px] p-1.5 ring-1"
    style={{
      left: Math.min(at.left, window.innerWidth - 252),
      top: at.top + 6,
    }}
  >
    {matches.map((member, index) => (
      <li key={member.userId}>
        <button
          type="button"
          tabIndex={-1}
          aria-current={index === active}
          // Keep editor focus: picking must not blur the selection the range depends on.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onPick(member)}
          className="aria-[current=true]:bg-accent flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left text-[13px]"
        >
          <UserAvatar size={24} user={{ id: member.userId, ...member }} />
          <span className="min-w-0 flex-1 truncate font-medium">
            {member.name}
          </span>
          <span className="text-muted-foreground truncate">
            @{member.username}
          </span>
        </button>
      </li>
    ))}
  </ul>
);

export const CommentComposer = ({
  disabled,
  members,
  initial = "",
  submitLabel = "Comment",
  placeholder = "Write a comment",
  compact = false,
  autoFocus = true,
  onSubmit,
  onCancel,
}: {
  disabled: boolean;
  members: Mentionable[];
  initial?: string;
  submitLabel?: string;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onSubmit: (markdown: string) => void;
  onCancel?: () => void;
}) => {
  // Key and suggestion handlers are captured when the editor is created, before it exists.
  const live = useRef<{
    submit: () => void;
    suggest: (e: KeyboardEvent) => boolean;
  } | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const { mention, onQuery, matches, active, move, dismiss } =
    useMention(members);
  const extensions = useMemo(
    () => [
      starter,
      MentionHighlight,
      MentionSuggest.configure({ onQuery }),
      EmptyPlaceholder.configure({ text: placeholder }),
    ],
    [onQuery, placeholder]
  );
  const editor = useEditor({
    extensions,
    content: initial ? fromMarkdown(initial) : "",
    immediatelyRender: false,
    // The character count and Comment button read the document on render.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: `${proseClass} bg-card border-input focus:outline-ring ${compact ? "min-h-10" : "min-h-16"} rounded-[15px] border px-3 py-2 focus:outline-2 focus:outline-solid focus:outline-offset-3`,
        "aria-label": placeholder,
      },
      handleKeyDown: (view, event) => {
        if (live.current?.suggest(event)) {
          return true;
        }
        const inBlock = ["listItem", "codeBlock"].some(
          (name) =>
            view.state.selection.$from.node(-1)?.type.name === name ||
            view.state.selection.$from.parent.type.name === name
        );
        if (event.key === "Enter" && !event.shiftKey && !inBlock) {
          event.preventDefault();
          live.current?.submit();
          return true;
        }
        return false;
      },
    },
  });

  const pick = (member: Mentionable) => {
    if (mention && editor) {
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: mention.from, to: mention.to },
          `@${member.username} `
        )
        .run();
    }
  };

  useEffect(() => {
    live.current = {
      submit: () => {
        if (!editor || disabled) {
          return;
        }
        const markdown = toMarkdown(editor.getJSON());
        if (markdown && markdown.length <= MAX_BODY) {
          onSubmit(markdown);
        }
      },
      suggest: (event) => {
        if (matches.length === 0) {
          return false;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          move(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Enter" || event.key === "Tab") {
          pick(matches[active]);
        } else if (event.key === "Escape") {
          dismiss();
        } else {
          return false;
        }
        event.preventDefault();
        return true;
      },
    };
  });

  useEffect(() => {
    if (autoFocus) {
      editor?.commands.focus("end");
    }
  }, [editor, autoFocus]);

  if (!editor) {
    return null;
  }
  const { length } = toMarkdown(editor.getJSON());
  const applyLink = () => {
    const chain = editor.chain().focus().extendMarkRange("link");
    (linkDraft ? chain.setLink({ href: linkDraft }) : chain.unsetLink()).run();
    setLinkDraft(null);
  };
  return (
    <div className="flex flex-col gap-2">
      {compact ? null : (
        <Toolbar
          editor={editor}
          onLink={() =>
            editor.isActive("link")
              ? editor.chain().focus().extendMarkRange("link").unsetLink().run()
              : setLinkDraft("https://")
          }
        />
      )}
      {linkDraft === null ? null : (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <Input
            autoFocus
            aria-label="Link URL"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      )}
      <EditorContent editor={editor} />
      {mention && matches.length > 0 ? (
        <MentionList
          at={mention}
          matches={matches}
          active={active}
          onPick={pick}
        />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs ${length > MAX_BODY ? "text-destructive" : "text-muted-foreground"}`}
        >
          {compact && length < MAX_BODY * 0.8
            ? "Enter to send · @ to mention"
            : `${length}/${MAX_BODY} · Enter to send`}
        </span>
        <span className="flex gap-1">
          {onCancel ? (
            <Button variant="ghost" size="sm" onPress={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            isDisabled={disabled || length === 0 || length > MAX_BODY}
            onPress={() => live.current?.submit()}
          >
            {submitLabel}
          </Button>
        </span>
      </div>
    </div>
  );
};

const bodyExtensions = [starter, MentionHighlight];

export const CommentBody = ({ markdown }: { markdown: string }) => {
  const editor = useEditor(
    {
      extensions: bodyExtensions,
      editable: false,
      immediatelyRender: false,
      content: fromMarkdown(markdown),
      editorProps: { attributes: { class: proseClass } },
    },
    [markdown]
  );
  return <EditorContent editor={editor} />;
};
