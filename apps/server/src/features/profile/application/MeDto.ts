import type { Person } from "../../../shared/application/interfaces/IProfiles";

export interface MeDto {
  id: string;
  name: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
}

export const toMeDto = ({
  id,
  name,
  email,
  username,
  avatarUrl,
}: Person): MeDto => ({
  id,
  name,
  email,
  username,
  avatarUrl,
});
