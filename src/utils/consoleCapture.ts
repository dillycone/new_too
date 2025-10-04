import util from 'node:util';

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error';

type ConsoleEntry = {
  level: ConsoleLevel;
  message: string;
};

type ConsoleListener = (entry: ConsoleEntry) => void;

export type SubscribeOptions = {
  levels?: ConsoleLevel[];
  predicate?: (entry: ConsoleEntry) => boolean;
};

const listeners = new Set<ConsoleListener>();

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let isPatched = false;

const formatArgs = (args: unknown[]): string => {
  if (args.length === 0) {
    return '';
  }

  return args
    .map(arg => {
      if (typeof arg === 'string') {
        return arg;
      }

      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`;
      }

      return util.inspect(arg, { depth: 3, colors: false });
    })
    .join(' ');
};

const notifyListeners = (entry: ConsoleEntry) => {
  if (!entry.message) {
    return;
  }

  for (const listener of listeners) {
    listener(entry);
  }
};

const createPatchedMethod = (level: ConsoleLevel) => {
  const isErr = level === 'warn' || level === 'error';
  const original = originalConsole[level];

  return (...args: unknown[]) => {
    const message = formatArgs(args);
    notifyListeners({ level, message });

    // Mirror to the corresponding stream when it is not a TTY for visibility (e.g. tests)
    const targetIsTTY = isErr ? process.stderr.isTTY : process.stdout.isTTY;
    if (!targetIsTTY) {
      original(...args);
    }
  };
};

const ensurePatched = () => {
  if (isPatched) {
    return;
  }

  console.log = createPatchedMethod('log');
  console.info = createPatchedMethod('info');
  console.warn = createPatchedMethod('warn');
  console.error = createPatchedMethod('error');

  isPatched = true;
};

export const subscribeToConsole = (listener: ConsoleListener, options?: SubscribeOptions): (() => void) => {
  ensurePatched();

  const filtered: ConsoleListener = (entry) => {
    if (options?.levels && !options.levels.includes(entry.level)) {
      return;
    }
    if (options?.predicate && !options.predicate(entry)) {
      return;
    }
    listener(entry);
  };

  listeners.add(filtered);

  return () => {
    listeners.delete(filtered);
  };
};

export const restoreConsole = () => {
  if (!isPatched) {
    return;
  }

  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;

  listeners.clear();
  isPatched = false;
};
