export interface InviteEmail {
  subject: string;
  text: string;
  html: string;
}

// titles and names are user input and land in HTML
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
}): InviteEmail => ({
  subject: "You've been invited to a Narbel board",
  text: `${input.inviterName} invited you to the board "${input.boardTitle}".\n\nOpen it: ${input.link}\n`,
  html: `<p><strong>${escapeHtml(input.inviterName)}</strong> invited you to the board <strong>${escapeHtml(input.boardTitle)}</strong>.</p><p><a href="${escapeHtml(input.link)}">Open the board</a></p>`,
});
