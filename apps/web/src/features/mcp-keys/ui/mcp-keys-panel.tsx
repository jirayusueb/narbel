import { Button } from "@narbel/ui/components/button";
import { Field, FieldLabel } from "@narbel/ui/components/field";
import { Input } from "@narbel/ui/components/input";
import { Spinner } from "@narbel/ui/components/spinner";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SERVER_URL } from "@/shared/config";

import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "../api/keys";

const MCP_URL = `${SERVER_URL}/mcp`;

const clientConfig = (key: string) =>
  JSON.stringify(
    {
      mcpServers: {
        narbel: { type: "http", url: MCP_URL, headers: { "x-api-key": key } },
      },
    },
    null,
    2
  );

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Clipboard unavailable");
  }
};

const CopyButton = ({ text, label }: { text: string; label: string }) => (
  <Button variant="secondary" size="sm" onPress={() => copy(text)}>
    <Copy data-icon="inline-start" />
    {label}
  </Button>
);

export const McpKeysPanel = () => {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const trimmed = name.trim();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-headline leading-tight font-normal">
          Connect an agent
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">
          Let AI agents read and edit your boards. Point an MCP client at the
          URL below and send the key in the{" "}
          <code className="font-mono text-[13px]">x-api-key</code> header.
        </p>
      </div>
      <div className="bg-card flex items-center gap-3 rounded-[15px] py-2 pr-2 pl-3">
        <span className="bg-citrus text-citrus-foreground shrink-0 rounded-[8px] px-2 text-xs font-medium">
          POST
        </span>
        <code className="text-moss min-w-0 flex-1 truncate font-mono text-[13px]">
          {MCP_URL}
        </code>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy URL"
          onPress={() => copy(MCP_URL)}
        >
          <Copy />
        </Button>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(trimmed, {
            onSuccess: (created) => {
              setFresh(created.key);
              setName("");
            },
            onError: (error) => toast.error(error.message),
          });
        }}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor="mcp-key-name">New key name</FieldLabel>
          <Input
            id="mcp-key-name"
            placeholder="Claude Desktop"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Button type="submit" isDisabled={!trimmed || create.isPending}>
          {create.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <KeyRound data-icon="inline-start" />
          )}
          Create key
        </Button>
      </form>
      {fresh ? (
        <div className="bg-card shadow-surface flex flex-col gap-3 rounded-[20px] p-5">
          <p className="text-muted-foreground text-sm">
            Copy this key now. It is shown only once.
          </p>
          <pre className="bg-muted text-foreground overflow-x-auto rounded-[10px] p-3 font-mono text-[13px]">
            {clientConfig(fresh)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={fresh} label="Copy key" />
            <CopyButton text={clientConfig(fresh)} label="Copy client config" />
          </div>
        </div>
      ) : null}
      {keys.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No keys yet. Create one to connect an MCP client.
        </p>
      ) : null}
      {keys.data?.length ? (
        <ul className="bg-card shadow-surface divide-border divide-y rounded-[20px]">
          {keys.data.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-sm font-medium">
                  {key.name ?? "Unnamed key"}
                </span>
                <span className="text-subtle-foreground shrink-0 font-mono text-[13px]">
                  {key.start}…
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:text-destructive"
                aria-label={`Revoke ${key.name ?? "key"}`}
                isDisabled={revoke.isPending}
                onPress={() =>
                  revoke.mutate(key.id, {
                    onError: (error) => toast.error(error.message),
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
