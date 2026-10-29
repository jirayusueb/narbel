import { Button } from "@narbel/ui/components/button";
import { Input } from "@narbel/ui/components/input";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold, Code, Heading2, Italic, Link2, List } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fromMarkdown, toMarkdown } from "../model/markdown";

export const MAX_BODY = 2000;

const extensions = [StarterKit.configure({ link: { openOnClick: false } })];

const proseClass =
  "text-xs [&_a]:underline [&_code]:bg-muted [&_h2]:text-sm [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_pre]:bg-muted [&_ul]:list-disc [&_ul]:pl-4 outline-none";

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

export const CommentComposer = ({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (markdown: string) => void;
}) => {
  // The key handler is captured when the editor is created, before `submit` can see the editor.
  const submitRef = useRef<(() => void) | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${proseClass} min-h-16 border bg-background p-2`,
        "aria-label": "Write a comment",
      },
      handleKeyDown: (view, event) => {
        const inBlock = ["listItem", "codeBlock"].some(
          (name) =>
            view.state.selection.$from.node(-1)?.type.name === name ||
            view.state.selection.$from.parent.type.name === name
        );
        if (event.key === "Enter" && !event.shiftKey && !inBlock) {
          event.preventDefault();
          submitRef.current?.();
          return true;
        }
        return false;
      },
    },
  });

  const submit = () => {
    if (!editor || disabled) {
      return;
    }
    const markdown = toMarkdown(editor.getJSON());
    if (markdown && markdown.length <= MAX_BODY) {
      onSubmit(markdown);
    }
  };

  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    editor?.commands.focus();
  }, [editor]);

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
      <Toolbar
        editor={editor}
        onLink={() =>
          editor.isActive("link")
            ? editor.chain().focus().extendMarkRange("link").unsetLink().run()
            : setLinkDraft("https://")
        }
      />
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
      <div className="flex items-center justify-between">
        <span
          className={`text-xs ${length > MAX_BODY ? "text-destructive" : "text-muted-foreground"}`}
        >
          {length}/{MAX_BODY} · Enter to send
        </span>
        <Button
          size="sm"
          isDisabled={disabled || length === 0 || length > MAX_BODY}
          onPress={submit}
        >
          Comment
        </Button>
      </div>
    </div>
  );
};

export const CommentBody = ({ markdown }: { markdown: string }) => {
  const editor = useEditor(
    {
      extensions,
      editable: false,
      immediatelyRender: false,
      content: fromMarkdown(markdown),
      editorProps: { attributes: { class: proseClass } },
    },
    [markdown]
  );
  return <EditorContent editor={editor} />;
};
