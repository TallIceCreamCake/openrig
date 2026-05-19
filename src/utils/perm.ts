import { useAuth } from '../context/AuthContext';

export type PermKey = keyof NonNullable<NonNullable<ReturnType<typeof useAuth>>['user']>;

export const hasPerm = (user: any, key: string) => {
  if (!user) return false;
  if (user.superadmin) return true;
  return !!user.permissions?.[key];
};

