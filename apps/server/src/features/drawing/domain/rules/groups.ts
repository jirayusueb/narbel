import type { Element } from "../entities/Element";

export class Groups {
  private constructor() {
    // static rules only
  }

  /** Excalidraw lists a group chain innermost first, so the outermost group is last. */
  static outermostGroup(element: Element): string | undefined {
    return element.groupIds?.at(-1);
  }

  static withGroup(element: Element, groupId: string): Element {
    return {
      ...element,
      groupIds: [...(element.groupIds ?? []), groupId],
    };
  }

  static withoutGroup(element: Element, groupId: string): Element {
    return {
      ...element,
      groupIds: (element.groupIds ?? []).filter((g) => g !== groupId),
    };
  }

  static existingGroup(
    members: Element[],
    page: Element[]
  ): string | undefined {
    const [first] = members;
    const shared = first && Groups.outermostGroup(first);
    if (!shared || members.some((m) => Groups.outermostGroup(m) !== shared)) {
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
  }

  static outermostGroups(elements: Element[]): string[] {
    return [
      ...new Set(elements.flatMap((e) => Groups.outermostGroup(e) ?? [])),
    ];
  }

  /** `members` plus every live holder of their outermost groups; a label follows its container. */
  static withGroupMates(members: Element[], page: Element[]): Element[] {
    const outer = new Set(Groups.outermostGroups(members));
    const ids = new Set(members.map((m) => m.id));
    const mates = page.filter(
      (e) =>
        !(e.isDeleted || ids.has(e.id)) &&
        typeof e.containerId !== "string" &&
        e.groupIds?.some((g) => outer.has(g)) === true
    );
    return [...members, ...mates];
  }
}
