"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";
import * as React from "react";
import { Modal, ModalOverlay } from "react-aria-components";

export const ARRIVE = [0.16, 1, 0.3, 1] as const;

export const overlayTransition = {
  enter: { duration: 0.3, ease: ARRIVE },
  exit: { duration: 0.2, ease: ARRIVE },
} satisfies Record<string, Transition>;

export const panelTransition = {
  enter: { duration: 0.35, ease: ARRIVE },
  exit: { duration: 0.24, ease: ARRIVE },
} satisfies Record<string, Transition>;

export const MotionOverlay = motion.create(ModalOverlay);
export const MotionModal = motion.create(Modal);

export const overlayClass =
  "fixed inset-0 isolate z-50 bg-black/30 backdrop-blur-[2px] dark:bg-black/50";

export type ModalRootProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onExitComplete?: () => void;
  isDismissable?: boolean;
  overlayClassName: string;
  /** Motion state of the panel hidden state; omit movement under reduced motion. */
  hidden: (reduce: boolean) => TargetAndTransition;
  panelClassName: string;
  panelProps?: Omit<
    React.ComponentProps<typeof MotionModal>,
    "className" | "children"
  >;
  panelSlot: string;
  overlaySlot: string;
  panelData?: Record<string, string>;
  children: React.ReactNode;
};

/** Controlled overlay + panel that stays mounted through its exit animation. */
export function ModalRoot({
  isOpen,
  onOpenChange,
  onExitComplete,
  isDismissable = true,
  overlayClassName,
  hidden,
  panelClassName,
  panelProps,
  panelSlot,
  overlaySlot,
  panelData,
  children,
}: ModalRootProps) {
  const reduce = useReducedMotion() ?? false;
  const off = hidden(reduce);
  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {isOpen ? (
        <MotionOverlay
          key="overlay"
          data-slot={overlaySlot}
          isOpen
          onOpenChange={onOpenChange}
          isDismissable={isDismissable}
          className={overlayClassName}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: overlayTransition.enter }}
          exit={{ opacity: 0, transition: overlayTransition.exit }}
        >
          <MotionModal
            data-slot={panelSlot}
            {...panelData}
            className={panelClassName}
            initial={off}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              transition: panelTransition.enter,
            }}
            exit={{ ...off, transition: panelTransition.exit }}
            {...panelProps}
          >
            {children}
          </MotionModal>
        </MotionOverlay>
      ) : null}
    </AnimatePresence>
  );
}
