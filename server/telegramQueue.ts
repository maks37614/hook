/** Process-wide Telegram admission pacer.
 *
 * The old queue awaited each Telegram HTTP response before admitting ANY
 * other chat. A single 10s network timeout therefore delayed unrelated
 * users even though Telegram permits requests to independent destinations.
 *
 * Admission remains serialized per bot to enforce spacing between request
 * starts; the HTTP send itself runs independently for distinct chats. Same-
 * chat sends remain ordered, and no bot or chat identity is in diagnostics.
 */
export class TelegramDispatchQueue {
  private readonly botAdmissionTails = new Map<string, Promise<void>>();
  private readonly chatDeliveryTails = new Map<string, Promise<void>>();
  private readonly nextBotAt = new Map<string, number>();
  private readonly nextChatAt = new Map<string, number>();
  private queued = 0;
  private inFlight = 0;
  private lastAdmissionWaitMs = 0;

  constructor(
    private readonly now = () => Date.now(),
    private readonly sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
    private readonly botGapMs = 120,
    private readonly chatGapMs = 1100,
  ) {}

  schedule<T>(botId: string, chatId: string, dispatch: () => Promise<T>): Promise<T> {
    if (!botId || !chatId) return Promise.reject(new Error('Telegram destination missing'));
    this.queued++;
    const chatKey = JSON.stringify([botId, chatId]);
    const previousChat = this.chatDeliveryTails.get(chatKey) ?? Promise.resolve();
    const requestedAt = this.now();

    const work = previousChat.catch(() => {}).then(async () => {
      // A second send to one chat must first wait for its earlier HTTP send
      // to finish. Only THEN enter the bot's reservation queue: otherwise a
      // pending slow same-chat send could block or burst other chat starts.
      const previousAdmission = this.botAdmissionTails.get(botId) ?? Promise.resolve();
      const admitted = previousAdmission.catch(() => {}).then(async () => {
        const now = this.now();
        const botWait = Math.max(0, (this.nextBotAt.get(botId) ?? 0) - now);
        const chatWait = Math.max(0, (this.nextChatAt.get(chatKey) ?? 0) - now);
        const wait = Math.max(botWait, chatWait);
        if (wait > 0) await this.sleep(wait);
        const at = this.now();
        this.nextBotAt.set(botId, at + this.botGapMs);
        this.nextChatAt.set(chatKey, at + this.chatGapMs);
        this.lastAdmissionWaitMs = Math.max(0, at - requestedAt);
        // Bound metadata, not any active chat's FIFO delivery state.
        if (this.nextChatAt.size > 6000) {
          for (const [key, deadline] of this.nextChatAt) {
            if (deadline < at - this.chatGapMs) this.nextChatAt.delete(key);
          }
        }
      });
      // Reserve the next start slot for the same bot; free it immediately
      // after admission, not after a potentially 10-second HTTP response.
      const safeAdmission = admitted.then(() => {}, () => {});
      this.botAdmissionTails.set(botId, safeAdmission);
      void safeAdmission.then(() => {
        if (this.botAdmissionTails.get(botId) === safeAdmission)
          this.botAdmissionTails.delete(botId);
      });
      await admitted;
      this.inFlight++;
      try { return await dispatch(); }
      finally { this.inFlight--; }
    });
    const settled = work.then(() => {}, () => {});
    this.chatDeliveryTails.set(chatKey, settled);
    void settled.then(() => {
      if (this.chatDeliveryTails.get(chatKey) === settled)
        this.chatDeliveryTails.delete(chatKey);
    });
    return work.finally(() => { this.queued--; });
  }

  stats() {
    return { queued: this.queued, inFlight: this.inFlight,
      lastAdmissionWaitMs: this.lastAdmissionWaitMs };
  }
}
export const telegramDispatchQueue = new TelegramDispatchQueue();
