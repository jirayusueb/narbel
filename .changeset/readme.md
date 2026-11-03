# Changesets

All workspaces are private. Changesets updates their versions and `CHANGELOG.md` files. These commands do not publish packages or deploy applications.

- `bun run changeset` records a change in a new markdown file here.
- `bun run changeset:status` lists the pending version bumps.
- `bun run version-packages` consumes the pending files, bumps versions and updates changelogs.

Config reference: https://changesets.dev/guide/config
