export interface Piece {
  text: string;
  hit: boolean;
}

const escapeRegExp = (value: string) =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/** Splits `text` so every case-insensitive occurrence of `query` is its own hit piece. */
export const highlight = (text: string, query: string): Piece[] => {
  const needle = query.trim();
  if (needle === "") {
    return [{ text, hit: false }];
  }
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "iu"));
  // split with one capture group puts every match at an odd index
  return parts.flatMap((part, index) =>
    part === "" ? [] : [{ text: part, hit: index % 2 === 1 }]
  );
};
