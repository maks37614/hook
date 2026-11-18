/**
 * Only checks with equivalent or stronger options may share a result.
 * A manual refresh queued behind a background scan must actually run with
 * the manual options, without allowing two concurrent fetches for one coin.
 */
export interface SurveillanceCheckOptions {
  forceCheck: boolean;
  forceNotify: boolean;
}

export function normalizeSurveillanceCheckOptions(
  options: Partial<SurveillanceCheckOptions> | boolean = false,
): SurveillanceCheckOptions {
  return typeof options === 'boolean'
    ? { forceCheck: options, forceNotify: false }
    : { forceCheck: Boolean(options.forceCheck || options.forceNotify),
        forceNotify: Boolean(options.forceNotify) };
}

function checkPriority(options: SurveillanceCheckOptions): number {
  return options.forceNotify ? 2 : options.forceCheck ? 1 : 0;
}

interface CheckFlight<Result> {
  priority: number;
  promise: Promise<Result>;
}

/** A bounded one-at-a-time chain for each key, without a global mutex. */
export class ScopedSurveillanceChecks<Input, Result> {
  private readonly flights = new Map<string, CheckFlight<Result>>();

  constructor(
    private readonly run: (input: Input, options: SurveillanceCheckOptions) => Promise<Result>,
  ) {}

  check(key: string, input: Input, options: Partial<SurveillanceCheckOptions> | boolean = false): Promise<Result> {
    const normalized = normalizeSurveillanceCheckOptions(options);
    const priority = checkPriority(normalized);
    const previous = this.flights.get(key);

    // A running or queued stronger check can satisfy a weaker request; the
    // reverse must never happen (especially for forceNotify/manual checks).
    if (previous && previous.priority >= priority) return previous.promise;

    const execute = () => this.run(input, normalized);
    let promise: Promise<Result>;
    if (previous) {
      // Even when an exchange request fails, a later explicit manual check
      // still runs instead of inheriting the unrelated background failure.
      promise = previous.promise.then(execute, execute);
    } else {
      try { promise = execute(); }
      catch (error) { promise = Promise.reject(error); }
    }

    const flight: CheckFlight<Result> = { priority, promise };
    this.flights.set(key, flight);
    const cleanup = () => {
      if (this.flights.get(key) === flight) this.flights.delete(key);
    };
    void promise.then(cleanup, cleanup);
    return promise;
  }
}
