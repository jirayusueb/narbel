import { Button } from "@narbel/ui/components/button";
import { MessageSquarePlus } from "lucide-react";

export const CommentModeToggle = ({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (next: boolean) => void;
}) => (
  <Button
    variant="ghost"
    size="icon-sm"
    aria-label="Comment"
    aria-pressed={active}
    className="aria-pressed:bg-citrus aria-pressed:text-citrus-foreground"
    onPress={() => onChange(!active)}
  >
    <MessageSquarePlus />
  </Button>
);
