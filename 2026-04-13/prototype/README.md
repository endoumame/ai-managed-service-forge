<!-- textlint-disable -->
# InvoiceForge — 請求書自動仕訳プロトタイプ

AI エージェント + ハーネス + 決定論的コードの三位一体で、請求書から仕訳データを自動生成する AI マネージドサービスのプロトタイプ。

## コンセプト

```
請求書テキスト → [ハーネス: 入力検証] → [AI: 解析・仕訳推定] → [ハーネス: 品質ゲート] → [人間: 承認] → CSV出力
                                                                         ↓
                                                                  [決定論的: 貸借一致・税額検証]
                                                                         ↓
                                                                  [ナレッジ: パターン学習・改善提案]
```

## セットアップ

```bash
cd 2026-04-13/prototype
npm install
```

## デモ実行

### モックモード（APIキー不要）

```bash
npm run demo:mock
```

### 実APIモード（Claude API使用）

```bash
export ANTHROPIC_API_KEY=your-key-here
npm run demo
```

## ディレクトリ構成

```
prototype/
├── types/           # 共通型定義（層間の契約）
│   └── index.ts
├── harness/         # ハーネス層（品質保証の要）
│   ├── lifecycle.ts # ライフサイクルフック（before/after各ステップ）
│   ├── checker.ts   # 品質チェック（パターン乖離度・金額整合性）
│   └── planner.ts   # 終了条件管理（AIの自己申告に頼らない）
├── agent/           # AIエージェント層（推論が活きる部分）
│   └── index.ts     # 請求書解析・仕訳推定（Claude API / モック）
├── deterministic/   # 決定論的コード層（100%正確な処理）
│   └── rules.ts     # 税計算・貸借バランス・科目マスタ照合
├── knowledge/       # ナレッジ管理（自己改善ループ）
│   ├── store.ts     # JSONファイルベースの永続化
│   └── improver.ts  # 修正パターン分析・改善提案生成
├── demo/            # デモ用エントリポイント
│   └── run.ts       # CLIデモ（全パイプライン実行）
└── data/            # ナレッジデータ（自動生成）
    ├── vendor-patterns.json
    ├── correction-history.json
    └── proposals.json
```

## 三位一体アーキテクチャ

### ハーネス層（このプロトタイプの核心）
- **before:parse**: 入力テキストの形式検証（空チェック、数値存在確認）
- **after:classify**: AI 仕訳推定後の決定論的検証（貸借一致、税額整合性、パターン乖離度）
- **before:approve**: 承認前のチェックリスト完了確認
- **終了条件**: 6 項目のチェックリストをハーネスが外部管理（AI の自己申告に依存しない）

### AIエージェント層
- 請求書テキストからの項目抽出（自然言語理解）
- 摘要文から勘定科目の推定（パターン認識）
- モック/実 API の切り替えに対応

### 決定論的コード層
- 消費税計算の検証（税率 x 税抜金額 = 税額）
- 貸借バランスチェック（借方合計 === 貸方合計）
- 勘定科目マスタとの照合
