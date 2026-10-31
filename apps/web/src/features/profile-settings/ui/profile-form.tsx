import { Button } from "@narbel/ui/components/button";
import { Field, FieldLabel } from "@narbel/ui/components/field";
import { Input } from "@narbel/ui/components/input";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Spinner } from "@narbel/ui/components/spinner";
import { Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { toast } from "sonner";

import { UserAvatar, useMe } from "@/entities/person";

import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  useRemoveAvatar,
  useUpdateName,
  useUploadAvatar,
} from "../api/profile";

const onError = (error: Error) => toast.error(error.message);

export const ProfileForm = () => {
  const { data: me } = useMe();
  const picker = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const updateName = useUpdateName();
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();

  if (!me) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  const name = draft ?? me.name;
  const trimmed = name.trim();
  const nameValid = trimmed.length >= 1 && trimmed.length <= 60;

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPEG or WebP image.");
    } else if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Avatars can be at most 2 MB.");
    } else {
      upload.mutate(file, {
        onError,
        onSuccess: () => toast.success("Avatar updated"),
      });
    }
  };

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    if (nameValid && trimmed !== me.name) {
      updateName.mutate(trimmed, {
        onError,
        onSuccess: () => {
          setDraft(null);
          toast.success("Name saved");
        },
      });
    }
  };

  return (
    <div className="bg-card shadow-surface flex flex-col gap-8 rounded-xl p-6 sm:p-8">
      <section className="flex flex-wrap items-center gap-5">
        <UserAvatar user={me} size={80} />
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              isDisabled={upload.isPending}
              onPress={() => picker.current?.click()}
            >
              {upload.isPending ? (
                <Spinner />
              ) : (
                <Upload data-icon="inline-start" />
              )}
              Upload photo
            </Button>
            {me.avatarUrl ? (
              <Button
                variant="ghost"
                size="sm"
                isDisabled={remove.isPending}
                onPress={() => remove.mutate(undefined, { onError })}
              >
                <Trash2 data-icon="inline-start" />
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground text-[13px]">
            {me.avatarUrl
              ? "PNG, JPEG or WebP, up to 2 MB."
              : "Your generated avatar. Upload a photo to replace it."}
          </p>
        </div>
        <input
          ref={picker}
          type="file"
          hidden
          accept={AVATAR_TYPES.join(",")}
          onChange={pick}
        />
      </section>
      <form onSubmit={saveName} className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
          <Input
            id="profile-name"
            maxLength={60}
            autoComplete="name"
            value={name}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="profile-username">Username</FieldLabel>
          <Input
            id="profile-username"
            readOnly
            value={me.username ? `@${me.username}` : ""}
            className="bg-muted text-muted-foreground"
          />
          <p className="text-muted-foreground text-[13px]">
            Usernames can&apos;t be changed.
          </p>
        </Field>
        <div>
          <Button
            type="submit"
            isDisabled={
              !nameValid || trimmed === me.name || updateName.isPending
            }
          >
            {updateName.isPending ? <Spinner /> : null}
            Save name
          </Button>
        </div>
      </form>
    </div>
  );
};
