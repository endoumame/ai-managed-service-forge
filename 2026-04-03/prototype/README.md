# ReconcileBot — 入金消込自動マッチング プロトタイプ

銀行入金データと売掛金台帳を自動マッチングし、3 段階（自動確定/候補/要調査）に分類する AI マネージドサービスのプロトタイプ。

## アーキテクチャ

```
harness/          ← ハーネス層（品質保証・ドリフト対策）
  lifecycle.ts       beforeMatch / afterMatch / beforeFinalize フック
  checker.ts         品質レポート生成
  planner.ts         終了条件管理

agent/            ← AIエージェント層（曖昧マッチング）
  index.ts           ナレッジ辞書検索 + ヒューリスティック類似度

deterministic/    ← 決定論的コード層（確実な処理）
  rules.ts           金額完全一致 / 手数料差額マッチング / エージング計算

knowledge/        ← ナレッジ管理（自己改善ループ）
  store.ts           振込名義→取引先マッピング辞書
  improver.ts        確定ルール昇格提案

demo/             ← デモ実行
  run.ts             CLIデモエントリポイント

data/             ← サンプルデータ
  deposits.json      入金データ
  receivables.json   売掛金データ
  knowledge.json     ナレッジ辞書
```

## セットアップ

```bash
cd 2026-04-03/prototype
npm install    # または pnpm install
```

## デモ実行

```bash
npx tsx demo/run.ts
```

## 処理フロー

1. **beforeMatch** — 入力データのバリデーション（ハーネス）
2. **決定論的マッチング** — 金額完全一致 → 手数料の差額一致（決定論的コード）
3. **AI曖昧マッチング** — ナレッジ辞書 → ヒューリスティック類似度（AI エージェント）
4. **afterMatch** — 二重マッチング検出・金額の整合性検証（ハーネス）
5. **beforeFinalize** — 終了条件チェック（ハーネス）
6. **品質レポート・ナレッジ蓄積** — 消込率・改善提案（ハーネス + ナレッジ）
