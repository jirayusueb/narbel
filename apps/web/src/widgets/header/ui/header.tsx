import { Link } from "@tanstack/react-router";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";

import { useSession } from "@/entities/session";
import { NotificationsBell } from "@/features/notifications";
import { UserMenu } from "@/features/user-menu";
import { BrandMark } from "@/shared/ui";

const NAV_LINK =
  "rounded-[8px] px-1 py-0.5 text-sm text-foreground decoration-transparent underline underline-offset-[0.35em] transition-colors duration-300 hover:decoration-foreground data-[status=active]:decoration-foreground";

// Below this the header always shows; past it, scrolling down tucks it away and any scroll up brings it back.
const TUCK_AFTER = 120;

export const Header = () => {
  const { data: session } = useSession();
  const { scrollY } = useScroll();
  const [elevated, setElevated] = useState(false);
  const [tucked, setTucked] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const previous = scrollY.getPrevious() ?? 0;
    setElevated(y > 8);
    setTucked(y > TUCK_AFTER && y > previous);
  });

  return (
    <motion.header
      style={{ viewTransitionName: "site-header" }}
      animate={{ y: tucked ? "-100%" : "0%" }}
      transition={{ duration: tucked ? 0.25 : 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`bg-background sticky top-0 z-40 grid h-20 grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 transition-shadow duration-300 md:px-[30px] ${
        elevated ? "shadow-[0_1px_0_var(--border)]" : ""
      }`}
    >
      <nav aria-label="Main" className="flex items-center gap-4 md:gap-5">
        {session ? (
          <Link to="/dashboard" className={NAV_LINK}>
            Boards
          </Link>
        ) : null}
        <Link
          to="/"
          hash="agents"
          className={`${NAV_LINK} max-sm:hidden`}
          activeOptions={{ includeHash: true }}
        >
          Agents
        </Link>
      </nav>
      <Link
        to="/"
        aria-label="narbel home"
        className="text-foreground rounded-[10px]"
      >
        <motion.span
          className="block"
          whileHover={{ rotate: -8 }}
          transition={{ duration: 0.5, ease: [0.6, 0, 0.1, 1] }}
        >
          <BrandMark className="size-8" />
        </motion.span>
      </Link>
      <div className="flex items-center justify-end gap-1.5">
        {session ? <NotificationsBell /> : null}
        <UserMenu />
      </div>
    </motion.header>
  );
};
