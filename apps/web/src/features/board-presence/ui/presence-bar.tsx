import { AnimatePresence, motion } from "motion/react";

import { UserAvatar } from "@/entities/person";

import type { Peer } from "../model/use-presence";

const POP = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.15 } },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
} as const;

interface PresenceProps {
  peers: Peer[];
  followId: number | null;
  onFollow: (clientId: number | null) => void;
}

// touch: 44px target and no "Esc" hint, for the standalone phone pill.
export const FollowingPill = ({
  peers,
  followId,
  onFollow,
  touch = false,
}: PresenceProps & { touch?: boolean }) => {
  const followed = peers.find((peer) => peer.clientId === followId);
  return (
    <AnimatePresence initial={false}>
      {followed ? (
        <motion.div
          key="following"
          data-presence
          {...POP}
          className="pointer-events-none"
        >
          <button
            type="button"
            onClick={() => onFollow(null)}
            aria-label={`Stop following ${followed.user.name}`}
            className={`bg-primary text-primary-foreground outline-ring pointer-events-auto cursor-pointer truncate rounded-full py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-solid ${
              touch
                ? "min-h-11 max-w-[calc(100vw-2rem)] px-4"
                : "max-w-48 px-2.5 pointer-coarse:min-h-11"
            }`}
          >
            Following {followed.user.name}
            {touch ? null : <span> · Esc to stop</span>}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export const PresenceBar = ({
  peers,
  followId,
  onFollow,
  pill = true,
}: PresenceProps & { pill?: boolean }) => (
  <div data-presence className="flex items-center gap-2">
    {pill ? (
      <FollowingPill peers={peers} followId={followId} onFollow={onFollow} />
    ) : null}
    <ul className="flex -space-x-2" aria-label={`${peers.length} others here`}>
      <AnimatePresence initial={false} mode="popLayout">
        {peers.map((peer) => (
          <motion.li key={peer.clientId} layout {...POP}>
            <button
              type="button"
              title={`Follow ${peer.user.name}`}
              aria-label={`Follow ${peer.user.name}`}
              aria-pressed={peer.clientId === followId}
              onClick={() =>
                onFollow(peer.clientId === followId ? null : peer.clientId)
              }
              className={`outline-ring block cursor-pointer rounded-full ring-2 transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid motion-reduce:hover:translate-y-0 ${
                peer.clientId === followId
                  ? "ring-foreground dark:ring-citrus"
                  : "ring-card"
              }`}
            >
              <UserAvatar user={peer.user} size={32} />
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  </div>
);
