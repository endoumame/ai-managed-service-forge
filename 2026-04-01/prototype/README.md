# InvoiceForge Prototype

AIマネージドサービスとして請求書の自動仕訳を行うプロトタイプ。

## Architecture

```
prototype/
├── harness/           # ハーネス層（ライフサイクル管理）
│   ├── lifecycle.ts   # before/afterフック（入力検証・金額整合性チェック等）
│   ├── checker.ts     # 品質スコアリング（信頼度・金額妥当性）
│   └── planner.ts     # 終了条件チェックリスト（ドリフト防止）
├── agent/             # AIエージェント層
│   └── index.ts       # 請求書データ抽出・仕訳科目推定
├── deterministic/     # 決定論的コード層
│   └── rules.ts       # 消費税計算・勘定科目マスタ・CSV出力
├── knowledge/         # ナレッジ管理
│   ├── store.ts       # パターン蓄積・修正記録
│   └── improver.ts    # 自動改善提案生成
├── demo/              # デモ用エントリポイント
│   ├── run.ts         # メイン実行ファイル
│   └── process.ts     # 請求書処理パイプライン
└── data/              # サンプルデータ
    ├── sample-invoices.json
    └── knowledge.json
```

## Setup

```bash
cd 2026-04-01/prototype
pnpm install
```

## Demo

```bash
pnpm run demo
```

The demo processes 3 sample invoices through the full pipeline:

1. **Input Validation** - Harness validates raw invoice data
2. **AI Extraction** - Extracts structured data from invoice JSON
3. **Quality Check** - Harness scores extraction confidence
4. **AI Classification** - Estimates journal account codes using knowledge patterns
5. **Amount Integrity** - Deterministic code verifies tax calculations
6. **Human Review** - Prompts user for approval when confidence is low or vendor is new
7. **Knowledge Update** - Records patterns and corrections for future improvement

## Key Design Decisions

### Harness-First Architecture
The harness layer wraps every AI operation with deterministic checks.
AI never self-reports completion; the planner's checklist controls the workflow.

### Drift Prevention
- External checklist management (planner.ts)
- Mandatory quality gates between processing steps
- Historical pattern deviation detection

### Knowledge Improvement Loop
- User corrections are recorded and accumulated
- When the same correction happens repeatedly, an improvement proposal is generated
- Proposals require human approval before being applied (human-in-the-loop)
