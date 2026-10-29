import Avatar from "boring-avatars";
import { useState } from "react";

import { PUBLIC_SERVER_URL } from "@/shared/config";

import type { UserRef } from "../model/types";

// DESIGN.md tokens: citrus, moss, light moss, ink, recess.
const PALETTE = ["#ddec61", "#63664a", "#979a73", "#080808", "#e1e1de"];

const resolve = (user: UserRef) => {
  const url =
    user.avatarUrl === undefined
      ? `/api/users/${user.id}/avatar`
      : user.avatarUrl;
  return url?.startsWith("/") ? `${PUBLIC_SERVER_URL}${url}` : url;
};

export const UserAvatar = ({
  user,
  size = 32,
  className = "",
}: {
  user: UserRef;
  size?: number;
  className?: string;
}) => {
  const src = resolve(user);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        <Avatar
          name={user.username ?? user.id}
          variant="beam"
          colors={PALETTE}
          size={size}
          className="size-full"
        />
      )}
    </span>
  );
};
