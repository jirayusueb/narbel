import { describe, expect, it } from "bun:test";

import { clientAddress } from "./clientAddress";

const request = (forwardedFor?: string) =>
  new Request("http://api.test/unlock", {
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });

describe("clientAddress", () => {
  it("ignores x-forwarded-for from a client that connects directly", () => {
    expect(clientAddress(request("1.2.3.4"), "203.0.113.9")).toBe(
      "203.0.113.9"
    );
  });

  it("takes the entry the proxy appended, not one the client wrote", () => {
    expect(clientAddress(request("6.6.6.6, 198.51.100.7"), "10.0.1.5")).toBe(
      "198.51.100.7"
    );
  });

  it("trusts proxies on every private range", () => {
    for (const peer of [
      "10.0.0.2",
      "172.18.0.3",
      "192.168.1.4",
      "127.0.0.1",
      "::1",
      "fd00::2",
      "::ffff:172.17.0.2",
    ]) {
      expect(clientAddress(request("198.51.100.7"), peer)).toBe("198.51.100.7");
    }
  });

  it("does not treat a public address next to a private range as private", () => {
    for (const peer of ["172.32.0.1", "11.0.0.1", "192.169.0.1"]) {
      expect(clientAddress(request("1.2.3.4"), peer)).toBe(peer);
    }
  });

  it("falls back to the peer when a proxy sends no header", () => {
    expect(clientAddress(request(), "10.0.1.5")).toBe("10.0.1.5");
  });

  it("names an unknown peer instead of sharing an empty key", () => {
    expect(clientAddress(request())).toBe("unknown");
  });
});
