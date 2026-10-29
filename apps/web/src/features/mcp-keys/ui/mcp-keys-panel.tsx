import { Badge } from "@narbel/ui/components/badge";
import { Button } from "@narbel/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@narbel/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@narbel/ui/components/field";
import { Input } from "@narbel/ui/components/input";
import { Separator } from "@narbel/ui/components/separator";
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
  <Button variant="outline" size="sm" onPress={() => copy(text)}>
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
    <Card>
      <CardHeader>
        <CardTitle>MCP access</CardTitle>
        <CardDescription>
          Let AI agents read and edit your boards. Point an MCP client at the
          URL below and send the key in the <code>x-api-key</code> header.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">POST</Badge>
          <code className="truncate">{MCP_URL}</code>
          <CopyButton text={MCP_URL} label="Copy URL" />
        </div>
        <Separator />
        <form
          className="flex items-end gap-2"
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
          <FieldGroup className="flex-1">
            <Field>
              <FieldLabel htmlFor="mcp-key-name">New key name</FieldLabel>
              <Input
                id="mcp-key-name"
                placeholder="Claude Desktop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </FieldGroup>
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
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">
              Copy this key now. It is shown only once.
            </p>
            <pre className="bg-muted text-foreground overflow-x-auto p-3">
              {clientConfig(fresh)}
            </pre>
            <div className="flex gap-2">
              <CopyButton text={fresh} label="Copy key" />
              <CopyButton
                text={clientConfig(fresh)}
                label="Copy client config"
              />
            </div>
          </div>
        ) : null}
        <Separator />
        <ul className="flex flex-col gap-2">
          {keys.data?.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {key.name ?? "Unnamed key"}{" "}
                <span className="text-muted-foreground">{key.start}…</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
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
          {keys.data?.length === 0 ? (
            <li className="text-muted-foreground">No keys yet.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
};
