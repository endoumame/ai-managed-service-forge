/**
 * ロガーモジュール
 *
 * oxlint-disable で no-console を局所的に無効化し、CLI出力を行う。
 * プロトタイプ用の出力抽象化レイヤー。
 */

// oxlint-disable no-console
const log = (...args: unknown[]): void => {
  console.log(...args);
};
// oxlint-enable no-console

export { log };
