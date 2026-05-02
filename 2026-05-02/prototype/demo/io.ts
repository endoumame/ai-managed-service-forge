/**
 * デモ用I/Oユーティリティ
 *
 * Node.jsモジュールはこのファイルに集約し、
 * 他のモジュールからの直接importを避ける。
 */
/* eslint-disable import/no-nodejs-modules -- demo runner requires Node.js I/O */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Node.js module types unavailable in this lint config */
/* eslint-disable @typescript-eslint/no-unsafe-call -- Node.js module types unavailable in this lint config */
/* eslint-disable @typescript-eslint/no-unsafe-argument -- Node.js module types unavailable in this lint config */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- Node.js module types unavailable in this lint config */
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const JSON_INDENT = 2;
const currentDir = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(currentDir, "../data");

const loadJson = <TResult>(relativePath: string): TResult => {
  const filePath = resolve(dataDir, relativePath);
  const raw = readFileSync(filePath, "utf8");
  const parsed: TResult = JSON.parse(raw);
  return parsed;
};

const saveJson = (relativePath: string, data: unknown): void => {
  const filePath = resolve(dataDir, relativePath);
  writeFileSync(filePath, JSON.stringify(data, null, JSON_INDENT), "utf8");
};

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

export { loadJson, log, saveJson };
