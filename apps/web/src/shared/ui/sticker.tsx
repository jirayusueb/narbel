import type { ComponentProps } from "react";

import { brand } from "./stickers/fun";
import { Sticker } from "./stickers/Sticker";

// Citrus bodies, moss for dark parts and checks: the stickers speak the same two accents as the UI.
const PALETTE = brand("#ddec61", "#717453");

export const BrandSticker = (
  props: Omit<ComponentProps<typeof Sticker>, "palette">
) => <Sticker palette={PALETTE} {...props} />;

export { chat, cloud, padlock, pen, pin } from "./stickers/icons";
