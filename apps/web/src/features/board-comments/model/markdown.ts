import type { JSONContent } from "@tiptap/react";

// Comments are stored as markdown but only ever rendered through TipTap nodes. This covers the
// starter-kit subset the composer can produce. shortcut: nested lists flatten on reload.

type Marks = NonNullable<JSONContent["marks"]>;

const SAFE_HREF = /^(?:https?:|mailto:)/iu;
const ESCAPABLE = /[\\*~`[\]#>-]/gu;
const INLINE =
  /\\(?<esc>[\\*~`[\]#>-])|\*\*(?<bold>.+?)\*\*|\*(?<italic>.+?)\*|~~(?<strike>.+?)~~|`(?<code>[^`]+)`|\[(?<label>[^\]]+)\]\((?<href>[^)\s]+)\)/gu;

const MARK_WRAP: Record<string, (text: string, mark: Marks[number]) => string> =
  {
    bold: (text) => `**${text}**`,
    italic: (text) => `*${text}*`,
    strike: (text) => `~~${text}~~`,
    link: (text, mark) => `[${text}](${mark.attrs?.href ?? ""})`,
  };

const inlineToMarkdown = (nodes: JSONContent[] = []) =>
  nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "  \n";
      }
      const text = node.text ?? "";
      if (node.marks?.some((mark) => mark.type === "code")) {
        return `\`${text}\``;
      }
      let out = text.replaceAll(ESCAPABLE, String.raw`\$&`);
      for (const mark of node.marks ?? []) {
        out = MARK_WRAP[mark.type]?.(out, mark) ?? out;
      }
      return out;
    })
    .join("");

const listToMarkdown = (
  node: JSONContent,
  render: (block: JSONContent) => string
) => {
  const ordered = node.type === "orderedList";
  return (node.content ?? [])
    .map((item, index) => {
      const body = (item.content ?? []).map(render).join("\n");
      return `${ordered ? `${index + 1}.` : "-"} ${body}`;
    })
    .join("\n");
};

const blockToMarkdown = (node: JSONContent): string => {
  const children = node.content ?? [];
  if (node.type === "heading") {
    return `${"#".repeat(node.attrs?.level ?? 1)} ${inlineToMarkdown(children)}`;
  }
  if (node.type === "bulletList" || node.type === "orderedList") {
    return listToMarkdown(node, blockToMarkdown);
  }
  if (node.type === "codeBlock") {
    return `\`\`\`\n${children.map((c) => c.text ?? "").join("")}\n\`\`\``;
  }
  if (node.type === "blockquote") {
    return children
      .map(blockToMarkdown)
      .join("\n\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  if (node.type === "horizontalRule") {
    return "---";
  }
  return inlineToMarkdown(children);
};

export const toMarkdown = (doc: JSONContent) =>
  (doc.content ?? []).map(blockToMarkdown).join("\n\n").trim();

const text = (value: string, marks: Marks): JSONContent => ({
  type: "text",
  text: value,
  ...(marks.length > 0 ? { marks } : {}),
});

const mergeText = (nodes: JSONContent[]) => {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    const prev = out.at(-1);
    if (
      prev?.type === "text" &&
      node.type === "text" &&
      JSON.stringify(prev.marks) === JSON.stringify(node.marks)
    ) {
      prev.text = (prev.text ?? "") + (node.text ?? "");
    } else {
      out.push(node);
    }
  }
  return out;
};

const inlineFromMarkdown = (src: string, marks: Marks = []): JSONContent[] => {
  const out: JSONContent[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index > last) {
      out.push(text(src.slice(last, m.index), marks));
    }
    const { esc, bold, italic, strike, code, label, href } = m.groups ?? {};
    if (esc) {
      out.push(text(esc, marks));
    } else if (bold) {
      out.push(...inlineFromMarkdown(bold, [...marks, { type: "bold" }]));
    } else if (italic) {
      out.push(...inlineFromMarkdown(italic, [...marks, { type: "italic" }]));
    } else if (strike) {
      out.push(...inlineFromMarkdown(strike, [...marks, { type: "strike" }]));
    } else if (code) {
      out.push(text(code, [{ type: "code" }]));
    } else if (SAFE_HREF.test(href)) {
      const link = { type: "link", attrs: { href } };
      out.push(...inlineFromMarkdown(label, [...marks, link]));
    } else {
      out.push(text(label, marks));
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    out.push(text(src.slice(last), marks));
  }
  return mergeText(out);
};

const paragraph = (lines: string[]): JSONContent => {
  const content = lines.flatMap((line, i) => {
    const nodes = inlineFromMarkdown(line.replace(/\s+$/u, ""));
    return i === 0 ? nodes : [{ type: "hardBreak" }, ...nodes];
  });
  return content.length > 0
    ? { type: "paragraph", content }
    : { type: "paragraph" };
};

const BULLET = /^\s*[-*] (?<body>.*)$/u;
const ORDERED = /^\s*\d+\. (?<body>.*)$/u;
const HEADING = /^(?<hashes>#{1,6}) (?<body>.*)$/u;

// Collects consecutive lines accepted by `take` starting at `from`; returns them and the next index.
const run = <T>(
  lines: string[],
  from: number,
  take: (line: string) => T | undefined
) => {
  const taken: T[] = [];
  let next = from;
  while (next < lines.length) {
    const value = take(lines[next]);
    if (value === undefined) {
      break;
    }
    taken.push(value);
    next += 1;
  }
  return { taken, next };
};

export const fromMarkdown = (markdown: string): JSONContent => {
  const lines = markdown.split("\n");
  const blocks: JSONContent[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const heading = HEADING.exec(line);
    const listPattern = [BULLET, ORDERED].find((p) => p.test(line));
    if (!line.trim()) {
      i += 1;
    } else if (line.startsWith("```")) {
      const body = run(lines, i + 1, (l) =>
        l.startsWith("```") ? undefined : l
      );
      i = body.next + 1;
      blocks.push({
        type: "codeBlock",
        content:
          body.taken.length > 0
            ? [{ type: "text", text: body.taken.join("\n") }]
            : [],
      });
    } else if (heading?.groups) {
      blocks.push({
        type: "heading",
        attrs: { level: heading.groups.hashes.length },
        content: inlineFromMarkdown(heading.groups.body),
      });
      i += 1;
    } else if (line.trim() === "---") {
      blocks.push({ type: "horizontalRule" });
      i += 1;
    } else if (line.startsWith("> ")) {
      const quoted = run(lines, i, (l) =>
        l.startsWith("> ") ? l.slice(2) : undefined
      );
      i = quoted.next;
      blocks.push({
        type: "blockquote",
        content: fromMarkdown(quoted.taken.join("\n")).content,
      });
    } else if (listPattern) {
      const items = run(lines, i, (l) => listPattern.exec(l)?.groups?.body);
      i = items.next;
      blocks.push({
        type: listPattern === BULLET ? "bulletList" : "orderedList",
        content: items.taken.map((body) => ({
          type: "listItem",
          content: [paragraph([body])],
        })),
      });
    } else {
      const para = run(lines, i, (l) => (l.trim() ? l : undefined));
      i = para.next;
      blocks.push(paragraph(para.taken));
    }
  }
  return {
    type: "doc",
    content: blocks.length > 0 ? blocks : [{ type: "paragraph" }],
  };
};
