import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  recognise,
  effectFor,
  kindMatchesDirection,
  type Recognition,
  type FinancialKind,
} from "./recognition";
import {
  isReversal,
  possibleOwnTransfer,
  reversalCandidates,
  sliceDuplicate,
  sliceIdentity,
  type SliceStatement,
  type SliceRow,
  type MatchRecord,
} from "./slice";
export type SliceChoice = {
  order: number;
  action: "IMPORT" | "SKIP" | "TRANSACTION" | "TRANSFER" | "DEFER";
  categoryId?: string;
  otherId?: string;
  kind?: FinancialKind;
  remember?: boolean;
};
export type SliceReviewRow = SliceRow & {
  recognition: Recognition;
  categoryId: string;
  duplicate: string;
  reversalOf: string;
  issue: string;
  otherId: string;
};
export type SlicePreview = {
  statement: SliceStatement;
  rows: SliceReviewRow[];
  canSetOpening: boolean;
  trackedBalance: number;
  accountName: string;
  projectedClosing: number;
  currentOpening: number;
};
export type SliceResult = {
  imported: number;
  skipped: number;
  reversals: number;
  reconciled: number;
  trackedBalance: number;
  statementClosing: number;
  closingDate: string;
  openingApplied: boolean;
  pending: number;
  reconciledClosing: number;
};
type Tx = Prisma.TransactionClient;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const key = (r: SliceRow) =>
  createHash("sha256").update(sliceIdentity(r)).digest("hex");
export async function trackedBalance(
  tx: Tx,
  userId: string,
  accountId: string,
) {
  const account = await tx.financialAccount.findFirstOrThrow({
    where: { id: accountId, userId },
  });
  const [t, incoming, outgoing] = await Promise.all([
    tx.transaction.groupBy({
      by: ["type"],
      where: { userId, accountId },
      _sum: { amount: true },
    }),
    tx.transfer.aggregate({
      where: { userId, toId: accountId },
      _sum: { amount: true },
    }),
    tx.transfer.aggregate({
      where: { userId, fromId: accountId },
      _sum: { amount: true },
    }),
  ]);
  return (
    account.openingBalance +
    t.reduce(
      (n, r) => n + (r.type === "INCOME" ? 1 : -1) * (r._sum.amount ?? 0),
      0,
    ) +
    (incoming._sum.amount ?? 0) -
    (outgoing._sum.amount ?? 0)
  );
}
export async function prepareSlice(
  tx: Tx,
  userId: string,
  accountId: string,
  statement: SliceStatement,
): Promise<SlicePreview> {
  const account = await tx.financialAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) throw new Error("Choose an account you own.");
  if (account.type === "CREDIT_CARD")
    throw new Error(
      "Choose the bank or wallet account represented by this Slice debit/credit statement, not a credit-card debt account.",
    );
  const [transactions, transfers, entries, categories, rules, learned] =
    await Promise.all([
      tx.transaction.findMany({
        where: { userId, accountId },
        include: { reversal: true },
      }),
      tx.transfer.findMany({
        where: { userId, OR: [{ fromId: accountId }, { toId: accountId }] },
      }),
      tx.sliceEntry.findMany({ where: { userId, accountId } }),
      tx.category.findMany({ where: { userId } }),
      tx.merchantRule.findMany({ where: { userId } }),
      tx.merchantClassification.findMany({ where: { userId } }),
    ]);
  const records: MatchRecord[] = transactions.map((t) => ({
    ...t,
    date: t.date.toISOString().slice(0, 10),
  }));
  const movements = transfers.map((t) => ({
    ...t,
    date: t.date.toISOString().slice(0, 10),
    type: t.fromId === accountId ? "EXPENSE" : "INCOME",
  }));
  const prior = new Map<string, string>();
  const usedReversals = new Set(
    transactions.filter((t) => t.reversal).map((t) => t.id),
  );
  const seenKeys = new Set<string>();
  const uniqueRows = statement.rows.filter((r) => {
    const k = key(r);
    if (seenKeys.has(k)) return false;
    seenKeys.add(k);
    return true;
  });
  const debits = [
    ...records,
    ...uniqueRows
      .filter(
        (r) =>
          r.debit && !r.error && !records.some((t) => sliceDuplicate(r, t)),
      )
      .map((r) => ({
        id: "row:" + r.order,
        date: r.date,
        amount: r.debit,
        type: "EXPENSE",
        description: r.description,
        reference: r.reference,
      })),
  ];
  const rows: SliceReviewRow[] = [];
  for (const r of statement.rows) {
    const identity = key(r);
    const receipt = entries.find((e) => e.key === identity);
    const existing = records.find(
      (t) =>
        sliceDuplicate(r, t) &&
        (!entries.some((e) => e.transactionId === t.id) ||
          entries.some((e) => e.transactionId === t.id && e.key === identity)),
    );
    const movement = movements.find((t) => sliceDuplicate(r, t));
    const duplicate = receipt
      ? "Previously imported statement entry"
      : existing
        ? `${existing.date} · ${existing.description}`
        : movement
          ? `${movement.date} · Existing transfer: ${movement.description}`
          : prior.get(identity) || "";
    let reversalOf = "";
    let issue = r.error;
    if (
      !duplicate &&
      r.credit &&
      (isReversal(r.description + " " + r.transactionType) ||
        /\brefund(?:ed)?\b/i.test(r.description))
    ) {
      const matches = reversalCandidates(r, debits).filter(
        (t) => !usedReversals.has(t.id),
      );
      if (matches.length === 1) {
        reversalOf = matches[0].id;
        usedReversals.add(reversalOf);
      } else
        issue = matches.length
          ? "More than one original UPI debit matches. Skip or explicitly record as an ordinary credit."
          : "Original UPI debit could not be matched safely. Import the original statement first, skip, or explicitly record as an ordinary credit.";
    }
    if (
      !duplicate &&
      !reversalOf &&
      possibleOwnTransfer(r.description + " " + r.transactionType)
    )
      issue =
        "Possible own-account transfer or card repayment. Choose the other account, explicitly keep as a transaction, or skip.";
    const type = r.debit ? "EXPENSE" : "INCOME";
    const recognition = recognise(
      r.description,
      type,
      r.transactionType,
      learned,
      rules,
    );
    if (reversalOf) {
      const original = debits.find((d) => d.id === reversalOf);
      if (original) {
        const merchant = recognise(
          original.description,
          "EXPENSE",
          "",
          learned,
          rules,
        );
        recognition.merchant = merchant.merchant;
        recognition.identity = merchant.identity;
        recognition.category = "Refunds";
        recognition.subcategory = [merchant.category, merchant.subcategory]
          .filter(Boolean)
          .join(" / ");
      }
      recognition.kind = "REVERSAL";
      recognition.effect = "NEUTRAL";
      recognition.review = false;
      recognition.confidence = "HIGH";
      recognition.evidence = [
        "Unique original debit matched by reference, date, direction and amount",
      ];
    }
    if (
      !duplicate &&
      !issue &&
      [
        "OWN_TRANSFER",
        "CARD_REPAYMENT",
        "CASH_WITHDRAWAL",
        "INVESTMENT",
        "REFUND",
        "REVERSAL",
      ].includes(recognition.kind) &&
      recognition.review
    )
      issue =
        "Confirm the financial purpose, choose the other account, or retain the movement as pending review. It must not be omitted from the balance.";
    rows.push({
      recognition,
      ...r,
      duplicate,
      reversalOf,
      issue,
      categoryId:
        recognition.categoryId ??
        categories.find(
          (c) => c.type === type && c.name === recognition.category,
        )?.id ??
        "",
      otherId: movement
        ? movement.fromId === accountId
          ? movement.toId
          : movement.fromId
        : "",
    });
    prior.set(identity, `Earlier source row ${r.order}`);
  }
  return {
    statement,
    rows,
    canSetOpening:
      account.openingBalance === 0 && !transactions.length && !transfers.length,
    trackedBalance: await trackedBalance(tx, userId, accountId),
    accountName: account.name,
    currentOpening: account.openingBalance,
    projectedClosing:
      account.openingBalance +
      transactions
        .filter(
          (t) => t.date.toISOString().slice(0, 10) <= statement.closingDate,
        )
        .reduce((n, t) => n + (t.type === "INCOME" ? t.amount : -t.amount), 0) +
      transfers
        .filter(
          (t) => t.date.toISOString().slice(0, 10) <= statement.closingDate,
        )
        .reduce(
          (n, t) => n + (t.toId === accountId ? t.amount : -t.amount),
          0,
        ) +
      rows
        .filter((r) => !r.duplicate)
        .reduce((n, r) => n + r.credit - r.debit, 0),
  };
}
export async function commitSlice(
  tx: Tx,
  userId: string,
  id: string,
  choices: SliceChoice[],
  useOpening: boolean,
): Promise<SliceResult> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
  const batch = await tx.importBatch.findFirst({ where: { id, userId } });
  if (!batch) throw new Error("Import not found.");
  const stored = batch.data as unknown as {
    slice?: SliceStatement;
    accountId?: string;
    format?: string;
  };
  if (batch.result) {
    if (stored.format !== "SLICE") throw new Error("Not a Slice import.");
    return batch.result as unknown as SliceResult;
  }
  if (!stored.slice || !stored.accountId)
    throw new Error("Analyse this Slice statement first.");
  if (stored.slice.errors.length)
    throw new Error(
      "Correct the source file and upload again: running-balance or row validation errors must be resolved before importing.",
    );
  const accountId = stored.accountId;
  await tx.$queryRaw`SELECT id FROM "FinancialAccount" WHERE id=${accountId} AND "userId"=${userId} FOR UPDATE`;
  const preview = await prepareSlice(tx, userId, accountId, stored.slice);
  if (useOpening && !preview.canSetOpening)
    throw new Error(
      "Opening balance was not changed: the account is no longer empty or already has an opening balance. Analyse again.",
    );
  if (
    new Set(choices.map((c) => c.order)).size !== choices.length ||
    choices.some((c) => !preview.rows.some((r) => r.order === c.order))
  )
    throw new Error("Invalid row choices.");
  const accounts = await tx.financialAccount.findMany({ where: { userId } });
  const categories = await tx.category.findMany({ where: { userId } });
  const saved = new Map<number, string>();
  const provenance = await tx.sliceEntry.findMany({
    where: { userId, accountId },
    include: {
      transaction: { select: { sourceOrder: true } },
      transfer: { select: { sourceOrder: true } },
    },
  });
  let orderOffset = 0;
  for (const row of preview.rows) {
    const known = provenance.find((e) => e.key === key(row));
    const position =
      known?.transaction?.sourceOrder ?? known?.transfer?.sourceOrder;
    if (position != null) {
      orderOffset = position - row.order;
      break;
    }
  }
  const result: SliceResult = {
    imported: 0,
    skipped: 0,
    reversals: 0,
    reconciled: 0,
    trackedBalance: 0,
    statementClosing: stored.slice.closing,
    closingDate: stored.slice.closingDate,
    openingApplied: useOpening,
    pending: 0,
    reconciledClosing: 0,
  };
  if (useOpening)
    await tx.financialAccount.update({
      where: { id: accountId },
      data: { openingBalance: stored.slice.opening },
    });
  for (const row of preview.rows) {
    const choice = choices.find((c) => c.order === row.order);
    if (!row.duplicate && choice?.action === "SKIP")
      throw new Error(
        `Source row ${row.order}: skipping a new bank movement would corrupt the balance. Keep it pending review instead.`,
      );
    if (row.duplicate) {
      await tx.sliceEntry.updateMany({
        where: {
          userId,
          accountId,
          key: key(row),
          source: { equals: Prisma.DbNull },
        },
        data: {
          source: json({
            description: row.description,
            reference: row.reference,
            transactionType: row.transactionType,
            date: row.date,
            debit: row.debit,
            credit: row.credit,
            balance: row.balance,
          }),
        },
      });
      result.skipped++;
      if (row.otherId) result.reconciled++;
      continue;
    }
    if (row.issue && (!choice || choice.action === "IMPORT"))
      throw new Error(`Source row ${row.order}: choose a resolution or skip.`);
    const type = row.debit ? "EXPENSE" : "INCOME";
    const amount = row.debit || row.credit;
    let savedRecognition = row.recognition;
    let transactionId: string | null = null,
      transferId: string | null = null;
    if (choice?.action === "TRANSFER") {
      savedRecognition = {
        ...row.recognition,
        kind:
          accounts.find((a) => a.id === choice.otherId)?.type ===
            "CREDIT_CARD" && row.debit > 0
            ? "CARD_REPAYMENT"
            : "OWN_TRANSFER",
        effect: "NEUTRAL",
        review: false,
        confidence: "USER",
        evidence: ["User confirmed the other owned account"],
      };
      if (
        !choice.otherId ||
        choice.otherId === accountId ||
        !accounts.some((a) => a.id === choice.otherId)
      )
        throw new Error(
          `Source row ${row.order}: choose a different account you own.`,
        );
      const fromId = row.debit ? accountId : choice.otherId,
        toId = row.debit ? choice.otherId : accountId;
      // Counterpart account + amount + exact reference/date evidence: no equal-amount-only reconciliation.
      const existing = await tx.transfer.findFirst({
        where: {
          userId,
          fromId,
          toId,
          amount,
          date: new Date(row.date),
          ...(row.reference
            ? { reference: row.reference }
            : { description: row.description }),
        },
      });
      if (existing) {
        transferId = existing.id;
        result.reconciled++;
        result.skipped++;
      } else {
        transferId = (
          await tx.transfer.create({
            data: {
              userId,
              fromId,
              toId,
              amount,
              date: new Date(row.date),
              reference: row.reference || null,
              description: row.description,
              sourceOrder: row.order + orderOffset,
            },
          })
        ).id;
        result.imported++;
      }
    } else {
      const recognition = { ...row.recognition };
      if (choice?.action === "DEFER") {
        recognition.review = true;
        recognition.effect = "NEUTRAL";
        recognition.evidence = [
          ...recognition.evidence,
          "User retained the bank movement pending classification",
        ];
      } else if (
        choice?.kind ||
        (choice?.action === "TRANSACTION" && !row.reversalOf)
      ) {
        const kind =
          choice.kind ?? (type === "EXPENSE" ? "PURCHASE" : "OTHER_INCOME");
        if (["OWN_TRANSFER", "CARD_REPAYMENT"].includes(kind))
          throw new Error(
            "Choose the linked transfer workflow and the other owned account.",
          );
        if (["REFUND", "REVERSAL"].includes(kind) && !row.reversalOf)
          throw new Error(
            "An unmatched refund/reversal must remain pending until its original debit can be identified.",
          );
        if (!kindMatchesDirection(kind, type))
          throw new Error(
            "The financial purpose must agree with the original debit/credit direction.",
          );
        recognition.kind = kind;
        recognition.effect = effectFor(kind, type);
        recognition.review = kind === "UNKNOWN";
        recognition.confidence = "USER";
        recognition.evidence = ["Explicit user classification"];
      }
      let categoryId = choice?.categoryId ?? row.categoryId;
      if (!categoryId && recognition.category && !recognition.review) {
        const category = await tx.category.upsert({
          where: {
            userId_name_type: { userId, name: recognition.category, type },
          },
          create: { userId, name: recognition.category, type },
          update: {},
        });
        if (!categories.some((c) => c.id === category.id))
          categories.push(category);
        categoryId = category.id;
      }
      if (
        categoryId &&
        !categories.some((c) => c.id === categoryId && c.type === type)
      )
        throw new Error(
          `Source row ${row.order}: choose your own matching category.`,
        );
      if (!categoryId)
        categoryId =
          categories.find((c) => c.name === "Uncategorised" && c.type === type)
            ?.id ?? "";
      if (!categoryId) {
        const uncategorised = await tx.category.upsert({
          where: { userId_name_type: { userId, name: "Uncategorised", type } },
          create: { userId, name: "Uncategorised", type },
          update: {},
        });
        categoryId = uncategorised.id;
        categories.push(uncategorised);
      }
      let reversalOfId: string | undefined;
      if (row.reversalOf) {
        reversalOfId = row.reversalOf.startsWith("row:")
          ? saved.get(Number(row.reversalOf.slice(4)))
          : row.reversalOf;
        if (!reversalOfId)
          throw new Error(
            `Source row ${row.order}: its original debit was skipped or recorded as a transfer. Skip this reversal too, or import both as transactions.`,
          );
        const original = await tx.transaction.findFirst({
          where: {
            id: reversalOfId,
            userId,
            accountId,
            type: "EXPENSE",
            amount,
          },
          include: { reversal: true },
        });
        if (!original || original.reversal)
          throw new Error(
            `Source row ${row.order}: reversal match changed; analyse again.`,
          );
      }
      transactionId = (
        await tx.transaction.create({
          data: {
            userId,
            accountId,
            categoryId,
            type,
            amount,
            date: new Date(row.date),
            description: row.description,
            reference: row.reference || null,
            sourceOrder: row.order + orderOffset,
            reversalOfId,
            accountingEffect: recognition.effect,
            classification: json(recognition),
          },
        })
      ).id;
      savedRecognition = recognition;
      if (recognition.review) result.pending++;
      if (choice?.remember) {
        if (recognition.review || !recognition.identity)
          throw new Error(
            "Confirm a specific merchant classification before remembering it.",
          );
        for (const identity of [
          recognition.identity,
          ...recognition.upi.map((u) => "upi:" + u),
        ])
          await tx.merchantClassification.upsert({
            where: {
              userId_identity_direction: { userId, identity, direction: type },
            },
            create: {
              userId,
              identity,
              direction: type,
              merchant: recognition.merchant,
              kind: recognition.kind,
              categoryId,
              subcategory: recognition.subcategory,
              effect: recognition.effect,
            },
            update: {
              merchant: recognition.merchant,
              kind: recognition.kind,
              categoryId,
              subcategory: recognition.subcategory,
              effect: recognition.effect,
            },
          });
      }
      saved.set(row.order, transactionId);
      result.imported++;
      if (reversalOfId) result.reversals++;
    }
    await tx.sliceEntry.create({
      data: {
        userId,
        accountId,
        source: json({
          description: row.description,
          reference: row.reference,
          transactionType: row.transactionType,
          date: row.date,
          debit: row.debit,
          credit: row.credit,
          balance: row.balance,
          recognition: savedRecognition,
        }),
        key: key(row),
        sourceOrder: row.order,
        balance: row.balance,
        date: new Date(row.date),
        transactionId,
        transferId,
      },
    });
  }
  result.trackedBalance = await trackedBalance(tx, userId, accountId);
  const check = await prepareSlice(tx, userId, accountId, stored.slice);
  // Recompute from saved ledger through the statement date; never substitute the bank balance for missing records.
  const closing =
    result.trackedBalance -
    (
      await tx.transaction.findMany({
        where: {
          userId,
          accountId,
          date: { gt: new Date(stored.slice.closingDate) },
        },
      })
    ).reduce((n, t) => n + (t.type === "INCOME" ? t.amount : -t.amount), 0) -
    (
      await tx.transfer.findMany({
        where: {
          userId,
          date: { gt: new Date(stored.slice.closingDate) },
          OR: [{ fromId: accountId }, { toId: accountId }],
        },
      })
    ).reduce((n, t) => n + (t.toId === accountId ? t.amount : -t.amount), 0);
  result.reconciledClosing = closing;
  if (closing !== stored.slice.closing || check.rows.some((r) => !r.duplicate))
    throw new Error(
      "Reconciliation failed: saved movements do not reproduce the statement closing balance. Nothing was saved. Review the opening balance, pre-existing transactions and duplicate decisions; do not replace the opening balance to conceal missing rows.",
    );
  await tx.importBatch.update({
    where: { id },
    data: {
      data: json({
        format: "SLICE",
        accountId,
        from: stored.slice.from,
        to: stored.slice.to,
        count: stored.slice.count,
        incoming: stored.slice.incoming,
        outgoing: stored.slice.outgoing,
        opening: stored.slice.opening,
      }),
      result: json(result),
    },
  });
  return result;
}
