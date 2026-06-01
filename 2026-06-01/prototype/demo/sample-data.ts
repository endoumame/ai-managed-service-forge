// デモ用サンプルデータ（ファイル読み込みの代替）

import type { PurchaseOrder, RawInvoice } from "../types.ts";

const INVOICES: RawInvoice[] = [
  {
    invoiceId: "INV-2026-001",
    metadata: { fileType: "json", receivedAt: "2026-05-16T09:00:00Z", source: "email" },
    rawText: `請求書\n\n株式会社テック・サプライズ\n〒100-0001 東京都千代田区千代田1-1-1\n\n請求先: 株式会社サンプル商事\n\n請求日: 2026-05-15\n支払期限: 2026-06-30\n\n品目: クラウドサーバー利用料（5月分）\n数量: 1\n単価: 150,000円\n小計: 150,000円\n消費税（10%）: 15,000円\n合計: 165,000円\n\n振込先: みずほ銀行 丸の内支店 普通 1234567\nインボイス登録番号: T1234567890123`,
  },
  {
    invoiceId: "INV-2026-002",
    metadata: { fileType: "json", receivedAt: "2026-05-21T10:30:00Z", source: "postal" },
    rawText: `御請求書\n\n(株)オフィスマート\n大阪市北区梅田2-2-2\n\n宛先: サンプル商事 御中\n\n発行日: 2026-05-20\n支払期日: 2026-06-末\n\n内容: コピー用紙A4 50箱\n金額: 50,000円\n内容: トナーカートリッジ 10本\n金額: 80,000円\n\n小計: 130,000円\n消費税（10%）: 13,000円\n請求金額: 143,000円\n\n口座: 三井住友銀行 梅田支店 普通 7654321\n登録番号: T9876543210987`,
  },
  {
    invoiceId: "INV-2026-003",
    metadata: { fileType: "json", receivedAt: "2026-05-26T14:00:00Z", source: "email" },
    rawText: `請求書\n\nフードデリバリー株式会社\n東京都渋谷区神南1-3-3\n\n請求先: 株式会社サンプル商事 総務部\n\n日付: 2026年5月25日\n期限: 2026年6月30日\n\n5月 社員食堂ケータリングサービス\n  - ランチ提供 20日間 × 50名 = 1,000食\n  - 単価: 800円/食\n  - 小計: 800,000円\n\n消費税（8%・軽減税率）: 64,000円\n合計金額: 864,000円\n\n振込先: 東京三菱UFJ銀行 渋谷支店 普通 9999999\nインボイス番号: T5555666677778`,
  },
];

const PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    accountCode: "6100",
    accountName: "通信費",
    items: [
      { description: "クラウドサーバー利用料", period: "monthly", quantity: 1, unitPrice: 150_000 },
    ],
    notes: "",
    poId: "PO-2026-101",
    taxRate: 0.1,
    totalAmount: 150_000,
    vendor: "株式会社テック・サプライズ",
    vendorAliases: ["テック・サプライズ", "テックサプライズ"],
  },
  {
    accountCode: "6300",
    accountName: "事務用品費",
    items: [{ description: "事務用品", period: "as-needed", quantity: null, unitPrice: null }],
    notes: "月額上限20万円",
    poId: "PO-2026-102",
    taxRate: 0.1,
    totalAmount: 200_000,
    vendor: "株式会社オフィスマート",
    vendorAliases: ["(株)オフィスマート", "オフィスマート"],
  },
  {
    accountCode: "7200",
    accountName: "福利厚生費",
    items: [
      { description: "社員食堂ケータリング", period: "monthly", quantity: 1000, unitPrice: 800 },
    ],
    notes: "軽減税率8%適用",
    poId: "PO-2026-103",
    taxRate: 0.08,
    totalAmount: 800_000,
    vendor: "フードデリバリー株式会社",
    vendorAliases: ["フードデリバリー"],
  },
];

export { INVOICES, PURCHASE_ORDERS };
