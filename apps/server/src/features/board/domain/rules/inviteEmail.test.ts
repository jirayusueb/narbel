import { describe, expect, it } from "bun:test";

import { buildInviteEmail } from "./inviteEmail";

describe("buildInviteEmail", () => {
  it("names the board, the inviter and the link", () => {
    const mail = buildInviteEmail({
      boardTitle: "Roadmap",
      inviterName: "Olive",
      link: "http://web/boards/b1",
    });
    expect(mail.subject).toBe("You've been invited to a Narbel board");
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("Roadmap");
      expect(body).toContain("Olive");
      expect(body).toContain("http://web/boards/b1");
    }
  });

  it("escapes user input in the html body", () => {
    const mail = buildInviteEmail({
      boardTitle: '<img src=x onerror="a">',
      inviterName: "<b>Eve</b>",
      link: "http://web/?a=1&b=2",
    });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<b>Eve");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;a&quot;&gt;");
    expect(mail.html).toContain("a=1&amp;b=2");
  });
});
