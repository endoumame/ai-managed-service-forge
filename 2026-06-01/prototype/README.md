# InvoiceForge プロトタイプ

AI 請求書マッチング＆仕訳エンジンのプロトタイプ実装。

## コンセプト

「AI エージェント＋ハーネス＋決定論的コード」の三位一体で請求書処理の完成品を提供する。

## アーキテクチャ

```
harness/        ← ライフサイクルフック・品質チェック・終了条件管理
agent/          ← AIによるデータ抽出（モック/Claude API）
deterministic/  ← 税計算・照合・仕訳ルール
knowledge/      ← フィードバック蓄積・改善提案生成
demo/           ← デモエントリポイント
```

## セットアップ

```bash
cd 2026-06-01/prototype
npm install
```

## デモ実行

```bash
# モックモード（APIキー不要）
MOCK_AI=true npx tsx demo/run.ts

# npm script経由
npm run demo:mock
```

## 実装済み機能

- ハーネスのライフサイクルフック（beforeExtract / afterExtract / afterMatch / afterJournalEntry）
- 終了条件の外部管理（CompletionPlanner によるチェックリスト）
- 品質チェック（重複検知・消費税整合性・インボイス番号形式・仕訳バランス）
- ナレッジの自動改善提案（フィードバック蓄積→改善提案生成）
- ヒューマン・イン・ザ・ループ（信頼度が低い場合に pending-review ステータス）
