/**
 * 決定論的コード層 — ルールベース処理
 *
 * なぜこの実装か:
 * AIに任せると不正確になりうる「計算」「フォーマット変換」「マスタ参照」を
 * 決定論的コードとして実装する。消費税の計算や勘定科目コードの管理は
 * ルールベースで100%正確に処理すべき領域であり、AIの推論に頼るべきではない。
 */

/** 請求書の明細行 */
interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
}

/** 抽出済み請求書データ */
interface InvoiceData {
  invoiceId: string;
  vendorName: string;
  vendorRegistrationNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  items: InvoiceLineItem[];
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/** 仕訳エントリ */
interface JournalEntry {
  vendorName: string;
  description: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  confidence: number;
  taxCategory: string;
}

/** 勘定科目マスタ */
interface AccountMaster {
  code: string;
  name: string;
  category: string;
}

// 標準的な勘定科目マスタ（プロトタイプ用の最小セット）
const ACCOUNT_MASTER: AccountMaster[] = [
  { category: "expense", code: "511", name: "仕入高" },
  { category: "expense", code: "521", name: "通信費" },
  { category: "expense", code: "522", name: "消耗品費" },
  { category: "expense", code: "523", name: "水道光熱費" },
  { category: "expense", code: "524", name: "旅費交通費" },
  { category: "expense", code: "525", name: "広告宣伝費" },
  { category: "expense", code: "526", name: "支払手数料" },
  { category: "expense", code: "527", name: "外注費" },
  { category: "expense", code: "528", name: "地代家賃" },
  { category: "expense", code: "529", name: "保険料" },
  { category: "expense", code: "530", name: "修繕費" },
  { category: "expense", code: "531", name: "雑費" },
  { category: "expense", code: "540", name: "租税公課" },
  { category: "liability", code: "210", name: "買掛金" },
  { category: "liability", code: "215", name: "未払金" },
  { category: "liability", code: "220", name: "仮払消費税" },
];

// 標準税率
const STANDARD_TAX_RATE = 0.1;
const REDUCED_TAX_RATE = 0.08;

/** 勘定科目コードの存在チェック */
const isValidAccountCode = (code: string): boolean => ACCOUNT_MASTER.some((am) => am.code === code);

/** 勘定科目名の取得 */
const getAccountName = (code: string): string | undefined =>
  ACCOUNT_MASTER.find((am) => am.code === code)?.name;

/**
 * 消費税計算（決定論的処理）
 * AIではなくルールベースで正確に算出する
 */
const calculateTax = (subtotal: number, taxRate: number = STANDARD_TAX_RATE): number =>
  Math.floor(subtotal * taxRate);

/**
 * 金額整合性の検証
 * 小計 + 税額 = 合計 のチェック（1円の丸め誤差を許容）
 */
/** 丸め誤差の許容範囲（円） */
const ROUNDING_TOLERANCE = 1;

const validateAmountIntegrity = (subtotal: number, tax: number, total: number): boolean =>
  Math.abs(subtotal + tax - total) <= ROUNDING_TOLERANCE;

/**
 * インボイス制度の適格請求書登録番号フォーマット検証
 * T + 13桁の数字
 */
const validateRegistrationNumber = (regNum: string): boolean => /^T\d{13}$/.test(regNum);

/**
 * 仕訳データをCSV行に変換（会計ソフト取込用）
 */
const journalToCSVRow = (invoice: InvoiceData, entry: JournalEntry): string => {
  const fields = [
    invoice.invoiceDate,
    entry.accountCode,
    entry.accountName,
    entry.debitAmount.toString(),
    entry.creditAmount.toString(),
    invoice.vendorName,
    entry.description,
    entry.taxCategory,
  ];
  return fields.map((field) => `"${field}"`).join(",");
};

const CSV_HEADER =
  '"日付","勘定科目コード","勘定科目名","借方金額","貸方金額","取引先","摘要","税区分"';

export {
  ACCOUNT_MASTER,
  calculateTax,
  CSV_HEADER,
  getAccountName,
  isValidAccountCode,
  journalToCSVRow,
  REDUCED_TAX_RATE,
  STANDARD_TAX_RATE,
  validateAmountIntegrity,
  validateRegistrationNumber,
};
export type { AccountMaster, InvoiceData, InvoiceLineItem, JournalEntry };
