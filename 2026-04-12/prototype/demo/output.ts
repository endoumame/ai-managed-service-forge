/**
 * デモ出力ユーティリティ
 * CLIデモ用の標準出力をラップする。
 */

const NEWLINE = "\n";

interface Writable {
  write: (text: string) => boolean;
}

interface ProcessLike {
  stdout: Writable;
  stderr: Writable;
}

/** 値がProcessLikeか検証する */
const isProcessLike = (value: unknown): value is ProcessLike =>
  typeof value === "object" && value !== null && "stdout" in value && "stderr" in value;

/** GlobalThisからprocessオブジェクトを安全に取得する */
const getProcess = (): ProcessLike => {
  const global: Record<string, unknown> = globalThis;
  const proc = global["process"];
  if (isProcessLike(proc)) {
    return proc;
  }
  throw new Error("process is not available");
};

/** 1行出力する */
const print = (message: string): void => {
  getProcess().stdout.write(`${message}${NEWLINE}`);
};

/** エラー出力する */
const printError = (message: string): void => {
  getProcess().stderr.write(`${message}${NEWLINE}`);
};

export { print, printError };
