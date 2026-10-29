import { buttonVariants } from "@narbel/ui/components/button";
import { Link } from "@tanstack/react-router";

import { useSession } from "@/entities/session";

export const HomePage = () => {
  const { data: session } = useSession();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="font-heading text-2xl font-medium">Narbel</h1>
      <p className="text-muted-foreground">
        A collaborative whiteboard. Draw together in real time, drop in images,
        and let AI agents edit the same board through MCP.
      </p>
      <Link
        to={session ? "/dashboard" : "/login"}
        className={buttonVariants({ size: "lg" })}
      >
        {session ? "Open your boards" : "Get started"}
      </Link>
    </div>
  );
};
