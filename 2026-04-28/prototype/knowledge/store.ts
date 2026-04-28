import type {
  AccountMaster,
  CorrectionRecord,
  ImprovementProposal,
  VendorMapping,
} from "../types.ts";

interface StoreData {
  vendors: VendorMapping[];
  accounts: AccountMaster[];
  corrections: CorrectionRecord[];
  improvements: ImprovementProposal[];
}

const NOT_FOUND = -1;
const DEFAULT_PAYMENT_TERM_DAYS = 30;
const DEFAULT_CORRECTION_COUNT = 0;

let store: StoreData = {
  accounts: [],
  corrections: [],
  improvements: [],
  vendors: [],
};

const initStore = (data: StoreData): void => {
  store = data;
};

const getSnapshot = (): StoreData => ({
  accounts: [...store.accounts],
  corrections: [...store.corrections],
  improvements: [...store.improvements],
  vendors: [...store.vendors],
});

const getVendors = (): VendorMapping[] => store.vendors;

const getAccounts = (): AccountMaster[] => store.accounts;

const getCorrections = (): CorrectionRecord[] => store.corrections;

const getImprovements = (): ImprovementProposal[] => store.improvements;

const findVendor = (name: string): VendorMapping | null => {
  const normalized = name.trim();
  return (
    store.vendors.find(
      (vendor) =>
        vendor.vendorName === normalized ||
        vendor.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized)),
    ) ?? null
  );
};

const findAccount = (code: string): AccountMaster | null =>
  store.accounts.find((acct) => acct.code === code) ?? null;

const isValidAccountCode = (code: string): boolean =>
  store.accounts.some((acct) => acct.code === code);

const addCorrection = (record: CorrectionRecord): void => {
  store.corrections.push(record);
};

const buildVendorFromChange = (change: Record<string, unknown>): VendorMapping => ({
  aliases: Array.isArray(change["aliases"]) ? (change["aliases"] as unknown[]).map(String) : [],
  correctionCount: DEFAULT_CORRECTION_COUNT,
  defaultAccountCode: String(change["defaultAccountCode"]),
  defaultAccountName: String(change["defaultAccountName"]),
  lastUsed: new Date().toLocaleDateString("sv-SE"),
  paymentTermDays: DEFAULT_PAYMENT_TERM_DAYS,
  vendorName: String(change["vendorName"]),
});

const addVendor = (vendor: VendorMapping): void => {
  store.vendors.push(vendor);
};

const updateVendor = (vendorName: string, updates: Partial<VendorMapping>): void => {
  const idx = store.vendors.findIndex((vendor) => vendor.vendorName === vendorName);
  if (idx !== NOT_FOUND) {
    store.vendors[idx] = { ...store.vendors[idx], ...updates };
  }
};

const addImprovement = (proposal: ImprovementProposal): void => {
  store.improvements.push(proposal);
};

const applyProposalSideEffect = (proposal: ImprovementProposal): void => {
  const change = proposal.proposedChange;
  if (proposal.type === "add_vendor_mapping") {
    addVendor(buildVendorFromChange(change));
  } else if (proposal.type === "update_default_account") {
    updateVendor(String(change["vendorName"]), {
      defaultAccountCode: String(change["accountCode"]),
      defaultAccountName: String(change["accountName"]),
    });
  }
};

const approveImprovement = (proposalId: string): boolean => {
  const idx = store.improvements.findIndex((prop) => prop.id === proposalId);
  if (idx === NOT_FOUND) {
    return false;
  }

  const proposal = store.improvements[idx];
  proposal.status = "approved";
  applyProposalSideEffect(proposal);

  return true;
};

export type { StoreData };
export {
  addCorrection,
  addImprovement,
  addVendor,
  approveImprovement,
  buildVendorFromChange,
  findAccount,
  findVendor,
  getAccounts,
  getCorrections,
  getImprovements,
  getSnapshot,
  getVendors,
  initStore,
  isValidAccountCode,
  updateVendor,
};
