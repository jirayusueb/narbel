const PREFIX = "page:";

export const pageParamOf = (pageId: string): string =>
  pageId.startsWith(PREFIX) ? pageId.slice(PREFIX.length) : pageId;

export const pageIdFromParam = (param: string | undefined): string | null => {
  if (!param) {
    return null;
  }
  return param.startsWith(PREFIX) ? param : `${PREFIX}${param}`;
};
