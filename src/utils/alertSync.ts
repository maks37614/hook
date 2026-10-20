import type { PriceAlert } from '../types';

/** Scope async results to one account and discard responses predating a user action. */
export class AlertSyncGuard {
  private owner: string | null = null;
  private revision = 0;
  private sequence = 0;
  private appliedSequence = 0;
  private deleted = new Set<string>();

  setUser(userId: string | null): void {
    if (userId === this.owner) return;
    this.owner = userId;
    this.invalidate();
    this.deleted.clear();
  }

  invalidate(): void { this.revision++; }

  request() { return { owner: this.owner, revision: this.revision, sequence: ++this.sequence }; }

  accept(ticket: ReturnType<AlertSyncGuard['request']>): boolean {
    if (!ticket.owner || ticket.owner !== this.owner || ticket.revision !== this.revision ||
      ticket.sequence < this.appliedSequence) return false;
    this.appliedSequence = ticket.sequence;
    return true;
  }

  remove(ids: string[]): void {
    ids.forEach(id => this.deleted.add(id));
    this.invalidate();
  }

  isRemoved(id: string): boolean { return this.deleted.has(id); }

  filter(alerts: PriceAlert[]): PriceAlert[] {
    if (!this.owner || !Array.isArray(alerts)) return [];
    const seen = new Set<string>();
    return alerts.filter(alert => {
      if (!alert?.id || (alert.userId && alert.userId !== this.owner) || this.deleted.has(alert.id) || seen.has(alert.id)) return false;
      seen.add(alert.id);
      return true;
    }).map(alert => alert.userId ? alert : { ...alert, userId: this.owner! });
  }
}

/** Only mirror new alerts or server-owned state changes, avoiding snapshot/write loops. */
export function getAlertMirrorWrites(serverAlerts: PriceAlert[], mirroredAlerts: PriceAlert[]): PriceAlert[] {
  const mirrored = new Map(mirroredAlerts.map(alert => [alert.id, alert]));
  return serverAlerts.filter(alert => {
    const existing = mirrored.get(alert.id);
    return !existing || existing.isActive !== alert.isActive || existing.triggered !== alert.triggered ||
      existing.triggeredAt !== alert.triggeredAt || existing.triggeredPrice !== alert.triggeredPrice;
  });
}

export function getAlertMirrorDeletes(serverAlerts: PriceAlert[], mirroredAlerts: PriceAlert[]): string[] {
  const serverIds = new Set(serverAlerts.map(alert => alert.id));
  return mirroredAlerts.filter(alert => !serverIds.has(alert.id)).map(alert => alert.id);
}
