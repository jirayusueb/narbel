import type { Email } from "../../application/interfaces/IEmailSender";

type Mail = Omit<Email, "to">;

// titles, names and comment excerpts are user input and land in HTML
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const buildInviteEmail = (input: {
  boardTitle: string;
  inviterName: string;
  link: string;
}): Mail => ({
  subject: "You've been invited to a Narbel board",
  text: `${input.inviterName} invited you to the board "${input.boardTitle}".\n\nOpen it: ${input.link}\n`,
  html: `<p><strong>${escapeHtml(input.inviterName)}</strong> invited you to the board <strong>${escapeHtml(input.boardTitle)}</strong>.</p><p><a href="${escapeHtml(input.link)}">Open the board</a></p>`,
});

export const buildCommentEmail = (input: {
  subject: string;
  headline: string;
  actorName: string;
  excerpt: string;
  link: string;
}): Mail => ({
  subject: input.subject,
  text: `${input.actorName} ${input.headline}:\n\n"${input.excerpt}"\n\nOpen the thread: ${input.link}\n`,
  html: `<p><strong>${escapeHtml(input.actorName)}</strong> ${escapeHtml(input.headline)}:</p><blockquote>${escapeHtml(input.excerpt)}</blockquote><p><a href="${escapeHtml(input.link)}">Open the thread</a></p>`,
});
