import { UserAvatar } from "@/entities/user";

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
        <span className="bg-primary text-primary-foreground max-w-48 truncate rounded-full px-2.5 py-1 text-xs max-sm:hidden">
          Following {followed.user.name} · Esc to stop
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
              title={`Follow ${peer.user.name}`}
              aria-label={`Follow ${peer.user.name}`}
              aria-pressed={peer.clientId === followId}
              onClick={() =>
                onFollow(peer.clientId === followId ? null : peer.clientId)
              }
              className={`outline-ring block cursor-pointer rounded-full ring-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid ${
                peer.clientId === followId
                  ? "ring-foreground dark:ring-citrus"
                  : "ring-background"
              }`}
            >
              <UserAvatar user={peer.user} size={32} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
