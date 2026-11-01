import type { Notation, RenderInput, RenderResult } from '@reonarudo/smiles-renderer';
import { parseMolecules } from './molecules';
import type { Reply, Request, Started, WorkerMessage } from './protocol';
import { sha256 } from './sha256';

/**
 * The render host: smiles-renderer's `createRuntime`, ported from a blocking Node worker to an
 * asynchronous browser Worker (docs/adr/0001-runtime-host.md). Options, limits, defaults, the
 * request sent to the worker and the wording of every result are the library's; what changed is
 * that `render` returns a promise and the worker answers by message.
 */

/** What the host needs from a worker; a browser `Worker` satisfies it, and so does the test adapter. */
export interface WorkerLike {
  onmessage: ((event: { data: WorkerMessage }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: Request): void;
  terminate(): void;
}

export interface HostOptions {
  /** Milliseconds per render; default 3000. */
  timeout?: number;
  /** Milliseconds per engine start; default 10000. */
  startupTimeout?: number;
  limits?: {
    /** Whole source, in string length; default 64000. */
    sourceChars?: number;
    /** Success output, in UTF-8 bytes; default 4 MiB. */
    outputBytes?: number;
    /** One line of the source, in string length; default 4000. */
    lineChars?: number;
  };
}

export interface Host {
  /** Renders are queued and run one at a time on one worker. */
  render(input: RenderInput): Promise<RenderResult>;
  /** Stops the worker; a render still waiting settles as unavailable. */
  dispose(): void;
}

/** A host-wide option: absent for its default, else a finite positive number. */
function option(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number`);
  }
  return value;
}

/** What a source of each notation holds, for messages. */
const wording: Record<Notation, string> = { smiles: 'molecule', smarts: 'pattern' };

interface Engine {
  worker: WorkerLike;
  started: Promise<Started>;
  pending: Map<number, (reply: Reply | undefined) => void>;
  /** Settle `started` now; a later answer from the worker is ignored. */
  abandon(): void;
}

const STOPPED: RenderResult = { status: 'unavailable', reason: 'the renderer was stopped' };

export function createHost(spawnWorker: () => WorkerLike, options: HostOptions = {}): Host {
  if (typeof options !== 'object' || options === null) throw new TypeError('options must be an object');
  if (options.limits !== undefined && (typeof options.limits !== 'object' || options.limits === null)) {
    throw new TypeError('limits must be an object');
  }
  const timeout = option(options.timeout, 'timeout', 3000);
  const startupTimeout = option(options.startupTimeout, 'startupTimeout', 10000);
  const sourceChars = option(options.limits?.sourceChars, 'limits.sourceChars', 64000);
  const outputBytes = option(options.limits?.outputBytes, 'limits.outputBytes', 4 * 1024 * 1024);
  const lineChars = option(options.limits?.lineChars, 'limits.lineChars', 4000);

  let current: Engine | undefined;
  let disposed = false;
  let nextId = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const spawn = (): Engine => {
    const worker = spawnWorker();
    const pending = new Map<number, (reply: Reply | undefined) => void>();
    let abandon = (): void => {};
    const started = new Promise<Started>((resolve) => {
      abandon = () => {
        window.clearTimeout(timer);
        resolve({ type: 'failed', reason: 'the renderer was stopped' });
      };
      const timer = window.setTimeout(
        () => resolve({ type: 'failed', reason: `OpenChemLib did not start within ${startupTimeout} ms` }),
        startupTimeout
      );
      worker.onmessage = ({ data }) => {
        if (data.type === 'reply') {
          pending.get(data.id)?.(data);
          return;
        }
        window.clearTimeout(timer);
        resolve(data);
      };
    });
    // A crash surfaces to the waiting render as a timeout, as in the library.
    worker.onerror = () => {};
    current = { worker, started, abandon, pending };
    return current;
  };

  /** Terminate this engine; renders still waiting on it settle as unavailable. */
  const stop = (engine: Engine): void => {
    // A render still waiting for this engine to start is not kept waiting for the start-up limit.
    engine.abandon();
    engine.worker.terminate();
    for (const settle of engine.pending.values()) settle(undefined);
    engine.pending.clear();
    if (current === engine) current = undefined;
  };

  const attempt = async (request: Omit<Request, 'id'>): Promise<RenderResult> => {
    if (disposed) return STOPPED;
    const engine = current ?? spawn();
    const started = await engine.started;
    if (disposed) return STOPPED;
    if (started.type === 'failed') {
      stop(engine);
      return { status: 'unavailable', reason: started.reason };
    }
    const id = ++nextId;
    let timedOut = false;
    const reply = await new Promise<Reply | undefined>((resolve) => {
      const timer = window.setTimeout(() => {
        timedOut = true;
        engine.pending.delete(id);
        resolve(undefined);
      }, timeout);
      engine.pending.set(id, (answer) => {
        window.clearTimeout(timer);
        engine.pending.delete(id);
        resolve(answer);
      });
      engine.worker.postMessage({ id, ...request });
    });
    if (timedOut) {
      stop(engine);
      return { status: 'timeout', budget: timeout };
    }
    if (!reply) return STOPPED;
    if (reply.discard) stop(engine);
    return reply.result;
  };

  // Start the first engine now, so the first fence does not wait for it.
  spawn();

  return {
    render(input) {
      if (typeof input !== 'object' || input === null || typeof input.source !== 'string' ||
        (input.notation !== 'smiles' && input.notation !== 'smarts')) {
        throw new TypeError("render() takes { source: string, notation: 'smiles' | 'smarts' }");
      }
      const { source, notation } = input;
      if (source.length > sourceChars) {
        return Promise.resolve({ status: 'failure', message: `${notation} source exceeds the ${sourceChars}-character limit` });
      }
      const long = source.split('\n').findIndex((line) => line.length > lineChars);
      if (long !== -1) {
        return Promise.resolve({ status: 'failure', message: `${notation} line exceeds the ${lineChars}-character limit`, line: long + 1 });
      }
      // The library's own split: the plugin's molecules.ts is the extension's copy of it, which
      // keeps a 0-based offset where the library's worker expects a 1-based column.
      const molecules = parseMolecules(source).map(({ smiles, label, line, offset }) =>
        label === undefined ? { smiles, line, column: offset + 1 } : { smiles, label, line, column: offset + 1 });
      if (molecules.length === 0) {
        return Promise.resolve({ status: 'failure', message: `the fence contains no ${wording[notation]}` });
      }
      // The same string means different things in the two notations, so both are in the digest.
      const prefix = `smiles-${sha256(`${notation}\0${source}`).slice(0, 8)}-`;
      const result = queue.then(() => attempt({ notation, molecules, prefix, outputBytes }));
      queue = result.catch(() => {});
      return result;
    },
    dispose() {
      disposed = true;
      if (current) stop(current);
    }
  };
}
