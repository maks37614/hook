/** Fixed-capacity FIFO for trades arriving while historical OHLCV loads.
 * Unlike Array.shift(), overwriting the oldest trade stays O(1) even during
 * a high-volume market burst. Draining restores chronological event order. */
export class TradeRingBuffer<T> {
  private items: T[] = [];
  private oldest = 0;
  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new Error('Ring buffer capacity must be a positive integer');
  }
  get length(): number { return this.items.length; }
  push(item: T): void {
    if (this.items.length < this.capacity) {
      this.items.push(item);
      return;
    }
    this.items[this.oldest] = item;
    this.oldest = (this.oldest + 1) % this.capacity;
  }
  drain(): T[] {
    const result = this.oldest === 0
      ? this.items.slice()
      : [...this.items.slice(this.oldest), ...this.items.slice(0, this.oldest)];
    this.clear();
    return result;
  }
  clear(): void {
    this.items = [];
    this.oldest = 0;
  }
}
