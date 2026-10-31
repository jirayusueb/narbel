import type { Element } from "../entities/Element";

/** Excalidraw lists a group chain innermost first, so the outermost group is last. */
export const outermostGroup = (element: Element): string | undefined =>
  element.groupIds?.at(-1);

export const withGroup = (element: Element, groupId: string): Element => ({
  ...element,
  groupIds: [...(element.groupIds ?? []), groupId],
});

export const withoutGroup = (element: Element, groupId: string): Element => ({
  ...element,
  groupIds: (element.groupIds ?? []).filter((g) => g !== groupId),
});

export const existingGroup = (
  members: Element[],
  page: Element[]
): string | undefined => {
  const [first] = members;
  const shared = first && outermostGroup(first);
  if (!shared || members.some((m) => outermostGroup(m) !== shared)) {
    return;
  }
  const holders = page.filter(
    (e) =>
      !e.isDeleted &&
      typeof e.containerId !== "string" &&
      e.groupIds?.includes(shared) === true
  );
  const wanted = new Set(members.map((m) => m.id));
  return holders.length === wanted.size &&
    holders.every((h) => wanted.has(h.id))
    ? shared
    : undefined;
};

export const outermostGroups = (elements: Element[]): string[] => [
  ...new Set(elements.flatMap((e) => outermostGroup(e) ?? [])),
];

/** `members` plus every live holder of their outermost groups; a label follows its container. */
export const withGroupMates = (
  members: Element[],
  page: Element[]
): Element[] => {
  const outer = new Set(outermostGroups(members));
  const ids = new Set(members.map((m) => m.id));
  const mates = page.filter(
    (e) =>
      !(e.isDeleted || ids.has(e.id)) &&
      typeof e.containerId !== "string" &&
      e.groupIds?.some((g) => outer.has(g)) === true
  );
  return [...members, ...mates];
};
