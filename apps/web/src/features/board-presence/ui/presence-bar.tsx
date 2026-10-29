import { colorFromName, initials } from "@/shared/lib";

import type { Peer } from "../model/use-presence";

export const PresenceBar = ({
  peers,
  followId,
  onFollow,
}: {
  peers: Peer[];
  followId: number | null;
  onFollow: (clientId: number | null) => void;
}) => {
  const followed = peers.find((peer) => peer.clientId === followId);
  return (
    <div data-presence className="flex items-center gap-2">
      {followed ? (
        <span className="bg-primary text-primary-foreground max-w-48 truncate rounded-full px-2.5 py-1 text-xs">
          Following {followed.name} · Esc to stop
        </span>
      ) : null}
      <ul
        className="flex -space-x-2"
        aria-label={`${peers.length} others here`}
      >
        {peers.map((peer) => (
          <li key={peer.clientId}>
            <button
              type="button"
              title={`Follow ${peer.name}`}
              aria-label={`Follow ${peer.name}`}
              aria-pressed={peer.clientId === followId}
              onClick={() =>
                onFollow(peer.clientId === followId ? null : peer.clientId)
              }
              className={`outline-ring grid size-8 cursor-pointer place-items-center rounded-full text-xs font-medium text-white ring-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid ${
                peer.clientId === followId
                  ? "ring-foreground dark:ring-citrus"
                  : "ring-background"
              }`}
              style={{ backgroundColor: colorFromName(peer.name).background }}
            >
              {initials(peer.name)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
