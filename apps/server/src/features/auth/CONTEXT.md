# identity: ubiquitous language

The words of the `identity` context. The context spans two modules, `features/auth` (this folder) and `features/profile`. A word means one thing inside this context; the third column names the neighbour's word it must not be confused with.

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Person | A human with an account: id, display name, username, and avatar. | boards: Member, a person's grant on one board. Retires `UserRef`. |
| Account | How a person signs in: an email address and a password. | Person. |
| Username | The handle used in mentions: 3 to 20 lowercase letters, digits, or underscores, unique, matched without case. | Display name. |
| Display name | The name other people see. | Username. |
| Avatar | A person's picture. | drawing: Image file. |
| Agent | Software that acts for a person through an API key or MCP OAuth, with exactly that person's access. | boards: Guest. |
| API key | A secret that lets an agent act for the person who created it. | boards: Share link. |
