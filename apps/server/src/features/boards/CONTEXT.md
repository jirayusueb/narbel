# boards: ubiquitous language

The words of the `boards` context, moved here from [docs/architecture/glossary.md](../../../../../docs/architecture/glossary.md) when the context got its own folder (migration step 6). A word means one thing inside this context; the third column names the neighbour's word it must not be confused with.

| Term | Meaning | Not to be confused with |
| --- | --- | --- |
| Board | A workspace a person owns: a title, a visibility, an optional password, and an optional share link. | drawing: Drawing, the content of the board. |
| Owner | The person who created the board. The owner holds every right and cannot also hold a grant on the same board. |  |
| Title | The name of a board, 1 to 120 characters after trimming. | drawing: the name of a page or a frame. |
| Visibility | Who can open a board without a grant: Private, Public, or Password. | Share link, which works under any visibility. |
| Private | Visibility where only the owner and people with a grant open the board. |  |
| Public | Visibility where anyone with the board's address can view it, without an account. Stored as `link`. | Share link, which can also give edit. |
| Password | Visibility where anyone who unlocks the board with its password can view it. A board cannot take this visibility before it has a password. |  |
| Unlock | Prove the board's password once. The browser then holds an unlock proof for 90 days. Changing the password voids every proof. Attempts are limited per board and client address. | drawing: Lock. Retires "locked board": say "password board". |
| Role | What a person may do on a board: `owner`, `editor` (reads and writes), or `viewer` (reads). | drawing: Peer, a connection. |
| Grant | A role given to an email address on a board. At most one grant per board and email. | Member and Invitation, the two states of a grant. Retires "access row". |
| Invite | Give a role to an email address. The invitee gets a notification if they have an account, and an email. |  |
| Invitation | A grant whose email has no person attached yet. | Retires `BoardMember` with `userId: null`. |
| Claim | Attach a person to the invitation for their email, on that person's first access to the board. A claim happens once and never changes. |  |
| Member | A grant with a person attached. | identity: Person. |
| Remove | Delete a grant. The person loses access on their next request. |  |
| Share link | A secret token in a URL that gives `viewer` or `editor` to whoever holds it, until its optional expiry. A board has at most one. | Public visibility. Retires `board_share` as a domain word. |
| Guest | Anyone who is not signed in. A guest gets `viewer` at most, even through an editor share link. | identity: Agent, which acts for a signed-in person. |
| Access | The role an actor ends up with on a board. The most specific source wins: ownership, then a grant, then a share link, then visibility. | Role, one input to it. |
| Access policy | The question every other context asks `boards`: may this actor read, write, or own this board, which boards may this person read, and who are the owner and members of this board. |  |
