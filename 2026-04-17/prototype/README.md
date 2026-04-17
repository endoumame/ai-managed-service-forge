# ContractGuard プロトタイプ

契約書リスクスコアリング＆条項チェッカーのプロトタイプ実装。

## セットアップ

```bash
cd 2026-04-17/prototype
npm install
```

## デモ実行

### モックモード（APIキー不要）

```bash
MOCK_AI=true npx tsx demo/run.ts
```

### Claude APIモード

```bash
export ANTHROPIC_API_KEY=your-api-key
npx tsx demo/run.ts
```

## アーキテクチャ

```
prototype/
├── harness/           # ハーネス層（AIを制御するインフラ）
│   ├── lifecycle.ts   # ライフサイクルフック・パイプライン
│   ├── checker.ts     # 品質チェック（引用検証・カバレッジ）
│   └── planner.ts     # 終了条件の外部管理
├── agent/             # AIエージェント層
│   └── index.ts       # Claude API呼び出し・条項分析
├── deterministic/     # 決定論的コード層
│   └── rules.ts       # 必須条項チェック・スコア計算
├── knowledge/         # ナレッジ管理
│   ├── store.ts       # JSON永続化
│   └── improver.ts    # 自動の改善提案を生成
└── demo/
    └── run.ts         # デモエントリポイント
```

## 実装済み機能

- ハーネスのライフサイクルフック（before/after 各ステップ）
- 終了条件の外部管理（AI に自己申告させない）
- ナレッジの自動改善提案
- ヒューマン・イン・ザ・ループの接点（承認フロー）
- AI スコアと決定論的スコアの乖離検出
