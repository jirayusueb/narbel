const IPV6_PRIVATE = /^(?:::1$|f[cd]|fe[89ab])/u;

// 10/8, 127/8, 172.16/12, 192.168/16: the ranges Docker and loopback hand out.
const isPrivateV4 = (address: string) => {
  const [a, b, ...rest] = address.split(".").map(Number);
  if (rest.length !== 2 || a === undefined || b === undefined) {
    return false;
  }
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const isPrivate = (address: string) => {
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    return isPrivateV4(lower.slice("::ffff:".length));
  }
  if (lower.includes(":")) {
    return IPV6_PRIVATE.test(lower);
  }
  return isPrivateV4(lower);
};

/**
 * The address a request came from. Our proxy (Traefik on the private Docker network) appends the
 * client it saw as the last x-forwarded-for entry; entries to its left are whatever the client
 * sent. The header counts only when the direct peer is on a private network, so a client that
 * reaches the API directly cannot choose its own address.
 */
export const clientAddress = (request: Request, peer?: string) => {
  if (peer && isPrivate(peer)) {
    const appended = request.headers
      .get("x-forwarded-for")
      ?.split(",")
      .at(-1)
      ?.trim();
    if (appended) {
      return appended;
    }
  }
  return peer ?? "unknown";
};
