# InvoiceGuard - 請求書の自動仕訳・異常検知 プロトタイプ

AI マネージドサービスのプロトタイプ実装。ハーネス + AI エージェント + 決定論的コードの三層構造で請求書処理の自動化を実現する。

## セットアップ

```bash
cd 2026-04-10/prototype
npm install
```

## デモ実行

```bash
npm run demo
```

API Key 不要のモックモードでデモが実行される。

## ディレクトリ構成

```
prototype/
├── harness/           # ハーネス層（ライフサイクル管理）
│   ├── lifecycle.ts   # before/after フック定義
│   ├── checker.ts     # 異常検知（品質チェック）
│   └── planner.ts     # 終了条件管理
├── agent/             # AIエージェント層
│   └── index.ts       # 仕訳分類エージェント
├── deterministic/     # 決定論的コード層
│   └── rules.ts       # 税率計算・バリデーション
├── knowledge/         # ナレッジ管理
│   └── store.ts       # インメモリストア + 改善ループ
├── data/              # デモ用データ
│   └── sample-invoices.ts
├── demo/              # デモエントリポイント
│   └── run.ts
└── types.ts           # 共通型定義
```

## デモで実証すること

1. ハーネスのライフサイクルフック（before/after ツールコール）
2. 終了条件の外部管理（AI に自己申告させない）
3. ナレッジの自動改善提案（承認/修正の蓄積からルール改善を提案）
4. ヒューマン・イン・ザ・ループの接点（承認フロー）
5. ドリフト対策（チェックリストによる完了検証）
