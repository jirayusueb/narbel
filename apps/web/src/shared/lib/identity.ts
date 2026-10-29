const hash = (name: string) => {
  let h = 0;
  for (const ch of name) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return h;
};

export const colorFromName = (name: string) => {
  const hue = hash(name) % 360;
  return {
    background: `hsl(${hue} 70% 55%)`,
    stroke: `hsl(${hue} 70% 35%)`,
  };
};

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
