# InvoiceForge プロトタイプ

受領請求書の自動仕訳マネージドサービスのプロトタイプ。

## コンセプト

AI エージェント + ハーネス + 決定論的コードの三位一体で「請求書→仕訳」の完成品を提供する。

## セットアップ

```bash
cd 2026-04-11/prototype
npm install
```

## デモ実行

```bash
npx tsx demo/run.ts
```

## ディレクトリ構成

```
prototype/
├── types.ts              # 共通型定義（層間の契約）
├── harness/              # ハーネス層
│   ├── lifecycle.ts      # ライフサイクルフック（before/after各ステップ）
│   ├── checker.ts        # 品質チェック（金額検算・乖離検知・重複検知）
│   └── planner.ts        # 終了条件管理（チェックリスト方式）
├── agent/                # AIエージェント層
│   └── index.ts          # 請求書情報抽出（モックモード対応）
├── deterministic/        # 決定論的コード層
│   └── rules.ts          # 仕訳ルールエンジン
├── knowledge/            # ナレッジ管理
│   ├── store.ts          # インメモリストレージ
│   └── improver.ts       # 自動改善ループ（修正パターン→ルール昇格提案）
└── demo/                 # デモ用
    ├── run.ts            # エントリポイント
    └── sample-invoices.json  # サンプル請求書データ
```

## 実装済み機能

1. **ハーネスのライフサイクルフック**: beforeExtract / afterExtract / afterClassify / beforeFinalize
2. **終了条件の外部管理**: AI の自己申告ではなくチェックリスト方式で完了判定
3. **ナレッジ自動改善提案**: 同一修正パターン 3 回でルール昇格を提案
4. **ヒューマン・イン・ザ・ループ**: flagged 仕訳は人間承認まで完了しない
5. **決定論的品質チェック**: 金額検算・過去パターン乖離検知・重複請求検知
