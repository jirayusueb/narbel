import { useClipboard } from "@reactuses/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const COPIED_MS = 1500;

export const useCopy = () => {
  const [, write] = useClipboard();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (text: string) => {
    try {
      await write(text);
      setCopied(true);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  return [copied, copy] as const;
};
