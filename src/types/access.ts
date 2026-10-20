export interface AccountAccess {
  userId: string;
  registeredAt: number;
  fullAccessUntil: null;
  hasFullAccess: boolean;
  status: 'free' | 'admin';
  isAdmin: boolean;
  serverNow: number;
}

// All authenticated users can access all pages, regardless of their age.
export function canOpenPage(_page: string, access: Pick<AccountAccess, 'hasFullAccess'> | null): boolean {
  return !!access?.hasFullAccess;
}
