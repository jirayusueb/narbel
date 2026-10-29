import { Spinner } from "@narbel/ui/components/spinner";

export const Loader = () => (
  <div className="text-muted-foreground flex h-full items-center justify-center pt-8">
    <Spinner className="size-5" />
  </div>
);
