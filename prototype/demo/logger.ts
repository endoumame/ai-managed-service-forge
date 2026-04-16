/*
 * デモ用ロガー
 * no-console ルールを回避しつつ標準出力に書き込む
 */

/* eslint-disable no-console */
const log = (...args: unknown[]): void => {
  globalThis.console.log(...args);
};
/* eslint-enable no-console */

const DIVIDER_WIDTH = 60;
const SUB_DIVIDER_WIDTH = 40;

const DIVIDER = "=".repeat(DIVIDER_WIDTH);
const SUB_DIVIDER = "-".repeat(SUB_DIVIDER_WIDTH);

const logStage = (title: string): void => {
  log(`\n${DIVIDER}`);
  log(`  ${title}`);
  log(DIVIDER);
};

const logResults = (results: { passed: boolean; message: string }[]): void => {
  for (const result of results) {
    const icon = result.passed ? "[OK]" : "[NG]";
    log(`  ${icon} ${result.message}`);
  }
};

export { log, logResults, logStage, SUB_DIVIDER, DIVIDER };
