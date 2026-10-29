/** Fan-out between server instances; messages are opaque bytes. */
export interface IPubSub {
  publish(channel: string, message: Uint8Array): Promise<void>;
  /** Resolves once the subscription is active; the result undoes it. */
  subscribe(
    channel: string,
    handler: (message: Uint8Array) => void
  ): Promise<() => Promise<void>>;
}
