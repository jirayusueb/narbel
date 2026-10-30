import type { SceneElement } from "../entities/SceneElement";

export const groupIdsOf = (element: SceneElement): string[] =>
  Array.isArray(element.groupIds) ? (element.groupIds as string[]) : [];

/** Excalidraw lists a group chain innermost first, so the outermost group is last. */
export const outermostGroup = (element: SceneElement): string | undefined =>
  groupIdsOf(element).at(-1);

export const withGroup = (
  element: SceneElement,
  groupId: string
): SceneElement => ({
  ...element,
  groupIds: [...groupIdsOf(element), groupId],
});

export const withoutGroup = (
  element: SceneElement,
  groupId: string
): SceneElement => ({
  ...element,
  groupIds: groupIdsOf(element).filter((g) => g !== groupId),
});

export const existingGroup = (
  members: SceneElement[],
  page: SceneElement[]
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
      groupIdsOf(e).includes(shared)
  );
  const wanted = new Set(members.map((m) => m.id));
  return holders.length === wanted.size &&
    holders.every((h) => wanted.has(h.id))
    ? shared
    : undefined;
};

export const outermostGroups = (elements: SceneElement[]): string[] => [
  ...new Set(elements.flatMap((e) => outermostGroup(e) ?? [])),
];

/** `members` plus every live holder of their outermost groups; a label follows its container. */
export const withGroupMates = (
  members: SceneElement[],
  page: SceneElement[]
): SceneElement[] => {
  const outer = new Set(outermostGroups(members));
  const ids = new Set(members.map((m) => m.id));
  const mates = page.filter(
    (e) =>
      !(e.isDeleted || ids.has(e.id)) &&
      typeof e.containerId !== "string" &&
      groupIdsOf(e).some((g) => outer.has(g))
  );
  return [...members, ...mates];
};
