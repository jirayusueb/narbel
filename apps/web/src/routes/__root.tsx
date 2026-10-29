import { createRootRoute } from "@tanstack/react-router";

import { RootDocument } from "@/app";

import appCss from "@/app/styles/index.css?url";

const TITLE = "narbel: one board for your team and its agents";
const DESCRIPTION =
  "A collaborative whiteboard where your team and AI agents draw on the same live board. Agents connect over MCP and their edits appear like another collaborator's.";

// og:image is relative: no public origin exists in shared/config yet, so crawlers
// that require absolute URLs need one added (see brand/README.md).
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "theme-color",
        content: "#f0f0eb",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#161616",
        media: "(prefers-color-scheme: dark)",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: "/og-image.png" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  component: RootDocument,
});
