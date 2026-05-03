# InvoiceGuard プロトタイプ

請求書受領→仕訳→承認の完全自動パイプラインを、AI マネージドサービスのアーキテクチャ（ハーネス＋AI エージェント＋決定論的コード）で実装したプロトタイプ。

## セットアップ

```bash
cd 2026-05-03/prototype
pnpm install
```

## デモ実行

### モックモード（APIキー不要）

```bash
INVOICE_GUARD_MOCK=true npx tsx demo/run.ts
```

### Claude APIモード（要APIキー）

```bash
ANTHROPIC_API_KEY=sk-xxx npx tsx demo/run.ts
```

## ディレクトリ構成

```
prototype/
├── harness/           # ハーネス層（ライフサイクル管理）
│   ├── lifecycle.ts   # before/afterフック定義
│   ├── checker.ts     # 品質チェック（借貸バランス、金額突合、異常値検知）
│   └── planner.ts     # 終了条件管理（チェックリストベース）
├── agent/             # AIエージェント層
│   └── index.ts       # Claude APIによるデータ抽出・勘定科目推定
├── deterministic/     # 決定論的コード層
│   └── rules.ts       # 税計算、仕訳生成、承認ルーティング、重複検知
├── knowledge/         # ナレッジ管理
│   ├── store.ts       # 取引先パターンストア
│   └── improver.ts    # 自動改善ループ（修正→提案→承認）
├── demo/              # デモ用エントリポイント
│   └── run.ts         # 全レイヤー統合デモ
├── data/              # サンプルデータ
│   └── sample-invoices.json
└── types.ts           # 共通型定義
```

## アーキテクチャの特徴

### ハーネスによるドリフト防止

- AI の「完了しました」宣言は終了判定に使用しない
- 外部チェックリストで全ステップの完了を管理
- 各処理ステップの before/after にバリデーションフックを挿入

### AI/決定論的コードの責務分離

- AI: テキスト理解（取引先名の正規化）、分類（勘定科目推定）、異常判断
- 決定論的コード: 税額計算、借貸バランス検証、重複検知、承認ルーティング

### ヒューマン・イン・ザ・ループ

自動的にレビュー対象となるトリガー条件は以下のとおりです。
- AI 信頼度が 0.8 未満。
- 請求金額が 100 万円以上。
- 過去平均からの乖離が 30%超。
