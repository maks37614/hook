import { TerminalContextEngine } from './engine';
import { MAX_ANALYSIS_MARKETS, type WorkerRequest, type WorkerResponse } from './model';

const engines = new Map<string, TerminalContextEngine>();
const worker = self as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage: (message: WorkerResponse) => void;
};
worker.onmessage = ({ data }) => {
  if (data.type === 'remove') { engines.delete(data.scope); return; }
  if (!engines.has(data.scope)) {
    if (engines.size >= MAX_ANALYSIS_MARKETS) return;
    engines.set(data.scope, new TerminalContextEngine());
  }
  const engine = engines.get(data.scope)!;
  if (data.type === 'seed') engine.seed(data.tf, data.rows, data.at);
  else worker.postMessage({ ...engine.update(data), requestId: data.requestId });
};
