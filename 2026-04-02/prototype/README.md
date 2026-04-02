# InvoicePilot プロトタイプ

請求書受領→仕訳推定→承認の自動パイプライン。AI マネージドサービスのコンセプト実証。

## アーキテクチャ

```
harness/        ハーネス層（ライフサイクルフック・品質チェック・終了条件管理）
agent/          AIエージェント層（Claude APIによる情報抽出・仕訳推定）
deterministic/  決定論的コード層（税額計算・マスタ照合・重複検出）
knowledge/      ナレッジ管理（自動改善ループ）
demo/           デモ用エントリポイント
data/           サンプルデータ・ナレッジストア
```

## セットアップ

```bash
cd 2026-04-02/prototype
npm install
```

## デモ実行

### デモモード（APIキー不要）

```bash
npm run demo
```

ハードコードされたサンプルデータでパイプライン全体の動作を確認できます。

### AI連携モード

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run demo
```

Claude API を使って実際の請求書テキストから情報を抽出し、仕訳を推定します。

## 実装されている機能

1. ハーネスのライフサイクルフック（afterExtraction / afterJournalEstimation / beforeApproval）
2. 終了条件の外部管理（チェックリスト形式でハーネスが管理）
3. ナレッジの自動改善提案（ユーザー承認フロー付き）
4. ヒューマン・イン・ザ・ループ（確信度ベースの自動/手動承認判定）
5. ドリフト対策（AI の自己申告に頼らない外部バリデーション）
