import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AccountAccess } from '../src/types/access';
import { DATA_DIR, readJson, writeJson } from './storage';

// Legacy trial, payment and code fields are ignored. Registered accounts never expire.
interface Member { userId: string; registeredAt: number; email?: string; displayName?: string; }
interface AccessStore { version: 1; members: Record<string, Member>; admins: string[]; codes?: unknown[]; }
const validUid = (uid: unknown): uid is string =>
  typeof uid === 'string' && uid.length > 0 && uid.length <= 128 &&
  uid !== 'guest' && !['__proto__', 'constructor', 'prototype'].includes(uid);

export class AccessService {
  private cache?: AccessStore;
  constructor(private file = path.join(DATA_DIR, 'access.json'), private now = () => Date.now()) {}
  private state(): AccessStore {
    if (!this.cache) {
      const value = readJson<AccessStore>(this.file, { version: 1, members: {}, admins: [] });
      if (value.version !== 1 || !value.members || typeof value.members !== 'object' ||
          !Array.isArray(value.admins)) throw new Error('Сховище акаунтів недоступне');
      this.cache = value;
    }
    return this.cache;
  }
  private commit(next: AccessStore) { writeJson(this.file, next); this.cache = next; }
  public ensureMember(userId: string, identity?: { email?: string; displayName?: string }): Member {
    if (!validUid(userId)) throw new Error('Недійсний ідентифікатор користувача');
    const state = this.state();
    const existing = Object.hasOwn(state.members, userId) ? state.members[userId] : undefined;
    const email = typeof identity?.email === 'string' ? identity.email.slice(0, 254) : existing?.email;
    const displayName = typeof identity?.displayName === 'string' ? identity.displayName.slice(0, 128) : existing?.displayName;
    if (existing && existing.email === email && existing.displayName === displayName) return existing;
    const member: Member = { ...(existing || { userId, registeredAt: this.now() }), email, displayName };
    this.commit({ ...state, members: { ...state.members, [userId]: member } });
    return member;
  }
  public status(userId: string): AccountAccess {
    const member = this.ensureMember(userId);
    const isAdmin = this.state().admins.includes(userId);
    return { userId, registeredAt: member.registeredAt, fullAccessUntil: null,
      hasFullAccess: true, isAdmin, serverNow: this.now(), status: isAdmin ? 'admin' : 'free' };
  }
  public hasFullAccess(userId?: string): boolean {
    if (!validUid(userId)) return false;
    return this.status(userId).hasFullAccess;
  }
  public setAdmin(userId: string, enabled: boolean) {
    if (!validUid(userId) || !Object.hasOwn(this.state().members, userId))
      throw new Error('Спочатку зареєструйтеся та відкрийте сайт цим акаунтом');
    const state = this.state();
    this.commit({ ...state, admins: [...state.admins.filter(uid => uid !== userId), ...(enabled ? [userId] : [])] });
  }
}
export const accessService = new AccessService();

export function getAccessAdminKey() {
  const file = path.join(DATA_DIR, 'access-admin.key');
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  try { fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error: any) { if (error.code !== 'EEXIST') throw error; }
  return fs.readFileSync(file, 'utf8').trim();
}
