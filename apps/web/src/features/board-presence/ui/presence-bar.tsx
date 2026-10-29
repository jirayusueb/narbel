import { AnimatePresence, motion } from "motion/react";

import { UserAvatar } from "@/entities/user";

import type { Peer } from "../model/use-presence";

const POP = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.15 } },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
} as const;

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
      <AnimatePresence initial={false}>
        {followed ? (
          <motion.span
            key="following"
            {...POP}
            className="bg-primary text-primary-foreground max-w-48 truncate rounded-full px-2.5 py-1 text-xs max-sm:hidden"
          >
            Following {followed.user.name} · Esc to stop
          </motion.span>
        ) : null}
      </AnimatePresence>
      <ul
        className="flex -space-x-2"
        aria-label={`${peers.length} others here`}
      >
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
};
