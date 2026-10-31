import type { VersionInfo } from "../ports/IBoardVersions";

export interface VersionDto {
  id: string;
  kind: VersionInfo["kind"];
  createdAt: string;
}

export const toVersionDto = (version: VersionInfo): VersionDto => ({
  id: version.id,
  kind: version.kind,
  createdAt: version.createdAt.toISOString(),
});
