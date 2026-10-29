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
    variant={active ? "default" : "outline"}
    size="sm"
    aria-pressed={active}
    onPress={() => onChange(!active)}
  >
    <MessageSquarePlus data-icon="inline-start" />
    Comment
  </Button>
);
