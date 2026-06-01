// eslint-disable-next-line no-console -- CLIプロトタイプのstdout出力基盤
const write = console.log.bind(console);

const log = (...args: unknown[]): void => {
  write(...args);
};

export { log };
