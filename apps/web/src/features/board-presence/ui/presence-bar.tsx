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
        <span className="bg-primary text-primary-foreground px-2 py-0.5 text-xs">
          Following {followed.name} · Esc to stop
        </span>
      ) : null}
      <ul
        className="flex -space-x-1"
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
              className={`grid size-7 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ${
                peer.clientId === followId ? "ring-primary" : "ring-background"
              }`}
              style={{ backgroundColor: colorFromName(peer.name).background }}
            >
              {initials(peer.name)}
            </button>
          </li>
        ))}
      </ul>
      {peers.length > 0 ? (
        <span className="text-muted-foreground text-xs">
          {peers.length} other{peers.length === 1 ? "" : "s"} here
        </span>
      ) : null}
    </div>
  );
};
