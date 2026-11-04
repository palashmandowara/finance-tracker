// Local, deterministic entity recognition. Confidence labels describe evidence, not statistical probabilities.
export const kinds = [
  "PURCHASE",
  "FOOD_DELIVERY",
  "GROCERIES",
  "TRAVEL",
  "OWN_TRANSFER",
  "PERSONAL_TRANSFER",
  "CARD_REPAYMENT",
  "SUBSCRIPTION",
  "UTILITY",
  "BANK_CHARGE",
  "INTEREST",
  "SALARY",
  "OTHER_INCOME",
  "REFUND",
  "REVERSAL",
  "CASH_WITHDRAWAL",
  "INVESTMENT",
  "UNKNOWN",
] as const;
export type FinancialKind = (typeof kinds)[number];
export type Effect = "EXPENSE" | "INCOME" | "NEUTRAL";
export type Recognition = {
  merchant: string;
  identity: string;
  upi: string[];
  kind: FinancialKind;
  category: string;
  subcategory: string;
  effect: Effect;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "USER";
  review: boolean;
  evidence: string[];
  categoryId?: string;
};
export type Learned = {
  identity: string;
  direction: string;
  merchant: string;
  kind: string;
  categoryId: string;
  subcategory: string;
  effect: string;
};
const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
export function merchantIdentity(description: string) {
  const envelope = description.replace(
    /^UPI[- /]+(?:debit|credit|refund)[- /]+\d{6,}[- /]+/i,
    "",
  );
  const parts = envelope.split("-");
  const bankIndex = parts.findIndex((p) =>
    /^(?:AIRP|NSPB|HDFC|RATN|YESB|UTIB|ICIC|SBIN|PUNB|KKBK|BARB|IDFB|FDRL|CNRB)[A-Z0-9]*$/i.test(
      p.trim(),
    ),
  );
  const payee = bankIndex > 0 ? parts.slice(0, bankIndex).join(" ") : envelope;
  const payment =
    bankIndex >= 0 ? parts.slice(bankIndex + 1).join("-") : envelope;
  const upi = [
    ...payment.matchAll(/\b([a-zA-Z0-9._+-]+)@([a-zA-Z][a-zA-Z0-9.]*)/g),
  ].map((m) => (m[1] + "@" + m[2]).toLowerCase());
  const stripped = payee
    .replace(/\b[a-zA-Z0-9._+-]+@[a-zA-Z][a-zA-Z0-9.-]*\b/g, " ")
    .replace(
      /\b(?:UPI|UTR|RRN|REF(?:ERENCE)?)(?:\s*(?:NO\.?|ID))?[:/# -]*\d{6,}\b/gi,
      " ",
    )
    .replace(/\b\d{6,}\b/g, " ")
    .replace(
      /^(?:(?:UPI|IMPS|NEFT|POS|ECOM|ACH|NACH)\s*[-/: ]*|(?:debit|credit|refund|payment|paid|received|sent)(?:\s+(?:to|from))?\s*[-/: ]*)+/i,
      "",
    )
    .replace(
      /\s+(?:from|via|through)\s+(?:slice|razorpay|pine labs|supermoney)\b.*$/i,
      "",
    )
    .replace(/\b(?:pvt\.?|private|limited|ltd\.?|india)\b/gi, " ")
    .replace(/[-/:|]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return { name: stripped, normalised: clean(stripped), upi };
}

type Merchant = {
  name: string;
  aliases: string[];
  upi: string[];
  kind: FinancialKind;
  category: string;
  subcategory: string;
};
const merchants: Merchant[] = [
  {
    name: "IRCTC",
    aliases: [
      "irctc",
      "indian railway catering and tourism corporation",
      "irctc rail connect",
      "irctc e ticketing",
      "irctc train ticketing",
      "irctc rail web",
      "irctc train ticketin",
      "irctc ticketing",
    ],
    upi: [
      "irctc",
      "irctcweb",
      "cf.irctc",
      "irctc.cf",
      "irctcrailweb",
      "irctctrainticketing",
    ],
    kind: "TRAVEL",
    category: "Travel",
    subcategory: "Train",
  },
  {
    name: "Nandini",
    aliases: [
      "nandini",
      "nandini dairy",
      "nandini milk",
      "nandini milk parlour",
      "karnataka milk federation",
    ],
    upi: ["nandini", "nandinidairy"],
    kind: "GROCERIES",
    category: "Groceries",
    subcategory: "Dairy",
  },
  {
    name: "Swiggy",
    aliases: ["swiggy", "bundl technologies", "swiggy instamart"],
    upi: ["swiggy", "swiggyupi", "swiggyinstamart"],
    kind: "FOOD_DELIVERY",
    category: "Food",
    subcategory: "Food Delivery",
  },
  {
    name: "Zomato",
    aliases: ["zomato", "eternal zomato"],
    upi: ["zomato", "zomatoupi"],
    kind: "FOOD_DELIVERY",
    category: "Food",
    subcategory: "Food Delivery",
  },
  {
    name: "Amazon",
    aliases: [
      "amazon",
      "amazon seller services",
      "amazon pay",
      "amazon pay balance",
      "amazon groceries",
      "amazon pay groceries",
    ],
    upi: ["amazon", "amazonpay", "amazonpaygrocery", "amazonpaybalanceload"],
    kind: "PURCHASE",
    category: "Shopping",
    subcategory: "Online Shopping",
  },
  {
    name: "Flipkart",
    aliases: ["flipkart", "flipkart internet", "flipkart payments"],
    upi: ["flipkart", "flipkartpay"],
    kind: "PURCHASE",
    category: "Shopping",
    subcategory: "Online Shopping",
  },
  {
    name: "Netflix",
    aliases: ["netflix", "netflix entertainment"],
    upi: ["netflix"],
    kind: "SUBSCRIPTION",
    category: "Subscriptions",
    subcategory: "Entertainment",
  },
  {
    name: "Spotify",
    aliases: ["spotify", "spotify premium", "spotify lt"],
    upi: ["spotify", "spotify.bdsi"],
    kind: "SUBSCRIPTION",
    category: "Subscriptions",
    subcategory: "Entertainment",
  },
  {
    name: "Uber",
    aliases: ["uber", "uber india systems"],
    upi: ["uber", "uberindia"],
    kind: "TRAVEL",
    category: "Travel",
    subcategory: "Taxi",
  },
  {
    name: "Ola",
    aliases: ["ola", "ola cabs", "ani technologies"],
    upi: ["olacabs", "ola"],
    kind: "TRAVEL",
    category: "Travel",
    subcategory: "Taxi",
  },
  {
    name: "BigBasket",
    aliases: ["bigbasket", "big basket", "supermarket grocery supplies"],
    upi: ["bigbasket"],
    kind: "GROCERIES",
    category: "Groceries",
    subcategory: "General",
  },
  {
    name: "Blinkit",
    aliases: ["blinkit", "grofers"],
    upi: ["blinkit", "grofers"],
    kind: "GROCERIES",
    category: "Groceries",
    subcategory: "General",
  },
  {
    name: "Zepto",
    aliases: ["zepto", "kiranakart technologies"],
    upi: ["zepto"],
    kind: "GROCERIES",
    category: "Groceries",
    subcategory: "General",
  },
  {
    name: "Airtel",
    aliases: ["airtel", "bharti airtel"],
    upi: ["airtel"],
    kind: "UTILITY",
    category: "Bills",
    subcategory: "Telecom",
  },
  {
    name: "Jio",
    aliases: ["jio", "reliance jio"],
    upi: ["jio", "reliancejio"],
    kind: "UTILITY",
    category: "Bills",
    subcategory: "Telecom",
  },
  {
    name: "BESCOM",
    aliases: ["bescom", "bangalore electricity supply company"],
    upi: ["bescom"],
    kind: "UTILITY",
    category: "Bills",
    subcategory: "Electricity",
  },
  {
    name: "Indian Railways",
    aliases: ["indian railways", "railway uts", "uts"],
    upi: ["uts", "railways"],
    kind: "TRAVEL",
    category: "Travel",
    subcategory: "Train",
  },
];
export function effectFor(kind: FinancialKind, direction: string): Effect {
  if (
    [
      "PURCHASE",
      "FOOD_DELIVERY",
      "GROCERIES",
      "TRAVEL",
      "SUBSCRIPTION",
      "UTILITY",
      "BANK_CHARGE",
    ].includes(kind)
  )
    return direction === "EXPENSE" ? "EXPENSE" : "NEUTRAL";
  if (["INTEREST", "SALARY", "OTHER_INCOME"].includes(kind))
    return direction === "INCOME" ? "INCOME" : "NEUTRAL";
  return "NEUTRAL";
}
export function recognise(
  description: string,
  direction: "INCOME" | "EXPENSE",
  metadata = "",
  learned: Learned[] = [],
  rules: { keyword: string; categoryId: string; type: string }[] = [],
): Recognition {
  const entity = merchantIdentity(description);
  const text = description + " " + metadata;
  const result: Recognition = {
    merchant: entity.name,
    identity: entity.normalised
      ? "merchant:" + entity.normalised
      : entity.upi[0]
        ? "upi:" + entity.upi[0]
        : "",
    upi: entity.upi,
    kind: "UNKNOWN",
    category: "",
    subcategory: "",
    effect: "NEUTRAL",
    confidence: "LOW",
    review: true,
    evidence: [
      "No sufficiently specific merchant or financial-purpose evidence",
    ],
  };
  const exact = merchants.filter((m) =>
    m.aliases.some((a) => clean(a) === entity.normalised),
  );
  const handle = merchants.filter((m) =>
    entity.upi.some(
      (u) =>
        m.upi.includes(
          u.split("@")[0].replace(/[._-]?(?:upi|pay)?\d+(?=\.|$)/g, ""),
        ) ||
        (m.name === "IRCTC" &&
          entity.upi.some((u) =>
            /^irctc(?:trainticke|\d+)(?:[.\d]|@)/.test(u),
          )),
    ),
  );
  const normalised = merchants.filter((m) =>
    m.aliases.some(
      (a) =>
        entity.normalised.startsWith(clean(a) + " ") &&
        /^(?:merchant|payment|online|order|upi|transaction|ref|no|id|ticket|train|rail|e ticket|test|for|via|from|remarks)(?: |$)/.test(
          entity.normalised.slice(clean(a).length + 1),
        ),
    ),
  );
  const hits = [...new Set([...exact, ...handle, ...normalised])];
  if (hits.length === 1) {
    result.merchant = hits[0].name;
  }
  const identities = [...entity.upi.map((u) => "upi:" + u), result.identity];
  const correction = identities
    .map((i) =>
      learned.find((r) => r.identity === i && r.direction === direction),
    )
    .find(Boolean);
  if (correction && kinds.includes(correction.kind as FinancialKind))
    return {
      ...result,
      merchant: correction.merchant,
      kind: correction.kind as FinancialKind,
      categoryId: correction.categoryId,
      subcategory: correction.subcategory,
      effect: effectFor(correction.kind as FinancialKind, direction),
      confidence: "USER",
      review: false,
      evidence: [
        "Previously confirmed user classification: " + correction.identity,
      ],
    };
  const own = rules
    .filter(
      (r) =>
        r.type === direction &&
        (" " + clean(description) + " ").includes(" " + clean(r.keyword) + " "),
    )
    .sort((a, b) => b.keyword.length - a.keyword.length)[0];
  // Financial-purpose evidence takes precedence over a merchant logo/name (e.g. Amazon refund or wallet load).
  const patterns: [RegExp, FinancialKind, string, string, boolean][] = [
    [/\b(?:reversal|reversed)\b/i, "REVERSAL", "", "", true],
    [/\b(?:refund|refunded|chargeback)\b/i, "REFUND", "", "", true],
    [
      /\b(?:self[ -]?transfer|own account|between accounts)\b/i,
      "OWN_TRANSFER",
      "",
      "",
      true,
    ],
    [
      /\b(?:credit card (?:bill|payment|repayment)|card repayment|cc bill)\b/i,
      "CARD_REPAYMENT",
      "",
      "",
      true,
    ],
    [/\b(?:ATM|cash withdrawal|cash wdl)\b/i, "CASH_WITHDRAWAL", "", "", true],
    [
      /\b(?:amazonpaybalanceload|amazon pay balance|balance load|balanceload|wallet (?:load|top.?up))\b/i,
      "OWN_TRANSFER",
      "",
      "",
      true,
    ],
    [
      /\b(?:mutual fund|investment|demat|sip instalment|zerodha|groww|wallet (?:load|top.?up))\b/i,
      "INVESTMENT",
      "Investments",
      "Allocation",
      true,
    ],
    [
      /\b(?:interest (?:cr|credit|paid|earned)|savings interest)\b/i,
      "INTEREST",
      "Income",
      "Interest",
      false,
    ],
    [/\b(?:salary|payroll)\b/i, "SALARY", "Income", "Salary", false],
    [
      /\b(?:bank charge|service charge|sms charge|maintenance fee|annual fee|atm fee)\b/i,
      "BANK_CHARGE",
      "Fees",
      "Bank Charges",
      false,
    ],
    [
      /\b(?:electricity bill|water bill|gas bill|broadband bill)\b/i,
      "UTILITY",
      "Bills",
      "Utilities",
      false,
    ],
  ];
  const purpose = patterns.find(([re]) => re.test(text));
  if (purpose) {
    const [, kind, category, subcategory, review] = purpose;
    const effect = effectFor(kind, direction);
    return {
      ...result,
      kind,
      category,
      subcategory,
      effect,
      review: review || effect === "NEUTRAL",
      confidence: review ? "MEDIUM" : "HIGH",
      evidence: ["Explicit financial-purpose pattern"],
      ...(own ? { categoryId: own.categoryId } : {}),
    };
  }
  if (own)
    return {
      ...result,
      kind: direction === "EXPENSE" ? "PURCHASE" : "OTHER_INCOME",
      categoryId: own.categoryId,
      effect: direction,
      confidence: "USER",
      review: false,
      evidence: ["Existing user-defined merchant rule"],
    };
  if (hits.length === 1) {
    const m = { ...hits[0] };
    if (
      (m.name === "Swiggy" && /instamart/i.test(text)) ||
      (m.name === "Amazon" && /grocer/i.test(text))
    ) {
      m.kind = "GROCERIES";
      m.category = "Groceries";
      m.subcategory = "General";
    }
    const credit = direction === "INCOME";
    const verification =
      m.name === "Spotify" && /\b(?:test|mandate)\b/i.test(text);
    return {
      ...result,
      merchant: m.name,
      identity: result.identity,
      kind: credit ? "REFUND" : m.kind,
      category: m.category,
      subcategory: m.subcategory,
      effect: credit || verification ? "NEUTRAL" : "EXPENSE",
      confidence: "HIGH",
      review: credit || verification,
      evidence: [
        exact.includes(m)
          ? "Exact normalised merchant alias"
          : handle.includes(m)
            ? "Known UPI payee identifier"
            : "Merchant alias with payment metadata",
        ...(credit ? ["Credit from a merchant needs refund confirmation"] : []),
      ],
    };
  }
  if (hits.length > 1)
    return {
      ...result,
      evidence: ["Conflicting merchant identities; review required"],
    };
  if (/\b(?:upi|imps|neft|transfer)\b/i.test(text))
    return {
      ...result,
      kind: "PERSONAL_TRANSFER",
      evidence: [
        "Payment rail identified; beneficiary ownership and purpose are unknown",
      ],
    };
  return result;
}

export function kindMatchesDirection(kind: FinancialKind, direction: string) {
  if (
    ["REFUND", "REVERSAL", "INTEREST", "SALARY", "OTHER_INCOME"].includes(kind)
  )
    return direction === "INCOME";
  if (
    [
      "PURCHASE",
      "FOOD_DELIVERY",
      "GROCERIES",
      "TRAVEL",
      "CARD_REPAYMENT",
      "SUBSCRIPTION",
      "UTILITY",
      "BANK_CHARGE",
      "CASH_WITHDRAWAL",
    ].includes(kind)
  )
    return direction === "EXPENSE";
  return true;
}
