# DepShield Prototype

依存パッケージ脆弱性トリアージ＆修復 PR サービスのプロトタイプ。

## Architecture

```
harness/          ハーネス層（ライフサイクル管理・ドリフト対策）
  lifecycle.ts    フック定義（before/after scan, triage, fix）
  checker.ts      品質チェック（一貫性、偽陰性、reasoning検証）
  planner.ts      終了条件管理（外部チェックリスト）

agent/            AIエージェント層
  index.ts        Claude APIトリアージ（モック対応）

deterministic/    決定論的コード層
  rules.ts        パッケージスキャン、CVE照合、到達可能性分析

knowledge/        ナレッジ管理
  store.ts        トリアージ結果の永続化
  improver.ts     自動改善ループ（フィードバック→パターン抽出）

demo/             デモ
  run.ts          全パイプライン実行エントリポイント
```

## Setup

```bash
cd 2026-04-16/prototype
npm install
```

## Run Demo

```bash
# モックモード（Claude API不要）
npm run demo:mock

# Claude API使用（ANTHROPIC_API_KEY環境変数が必要）
npm run demo
```

## What the Demo Shows

1. **Phase 1**: 5 つの依存パッケージをスキャンし、モック CVE データベースと照合
2. **Phase 2**: AI トリアージ（モック）で影響度を判定、ハーネスがサニティチェック
3. **Phase 2b**: 品質チェック＋ドリフト検知（低確信度→ヒューマンレビュー）
4. **Phase 3**: ナレッジベースに蓄積、人間フィードバックから改善提案を生成
