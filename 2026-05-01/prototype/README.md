# InvoiceForge — AI 請求書の自動仕訳マネージドサービス（プロトタイプ）

請求書テキストから情報を抽出し、勘定科目を自動分類して仕訳を生成する AI マネージドサービスのプロトタイプです。

## アーキテクチャ

```
harness/          ハーネス層（ライフサイクル管理・品質チェック・終了条件管理）
agent/            AI エージェント層（情報抽出・分類推論）
deterministic/    決定論的コード層（税計算・仕訳ルール・バリデーション）
knowledge/        ナレッジ管理（マッピング蓄積・自動改善ループ）
demo/             デモ用エントリポイント
```

## セットアップ

```bash
cd 2026-05-01/prototype
pnpm install
```

## デモ実行

モックモードで実行します（API キー不要）。

```bash
INVOICE_FORGE_MOCK=true pnpm demo
```

Claude API モードで実行します（要 ANTHROPIC_API_KEY）。

```bash
export ANTHROPIC_API_KEY=your-key
pnpm demo
```

## 実装済み機能

1. 請求書テキストからの情報抽出と勘定科目の推論
2. ハーネスによる外部バリデーションと承認フロー
3. ナレッジの自動改善ループ（修正フィードバック → マッピング更新 → ルール昇格）
