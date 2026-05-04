const write = (msg: string): void => {
  process.stdout.write(`${msg}\n`);
};

const logger = {
  error: (msg: string): void => {
    write(`[Harness] ⚠ ${msg}`);
  },
  info: (msg: string): void => {
    write(`[Harness] ${msg}`);
  },
  step: (msg: string): void => {
    write(`\n[Harness] ── ${msg}`);
  },
  warn: (msg: string): void => {
    write(`[Harness] 注意: ${msg}`);
  },
};

export { logger };
