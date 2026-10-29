import { Button } from "@narbel/ui/components/button";
import { MessagesSquare } from "lucide-react";

export const CommentsPanelToggle = ({
  open,
  onChange,
}: {
  open: boolean;
  onChange: (next: boolean) => void;
}) => (
  <Button
    variant="ghost"
    size="icon-sm"
    aria-label="Comments panel"
    aria-pressed={open}
    onPress={() => onChange(!open)}
  >
    <MessagesSquare />
  </Button>
);
