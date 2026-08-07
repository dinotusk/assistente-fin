import { describe, expect, it } from "vitest";

import { CsvFormatError, isDuplicate, parseCsv, parseOfx } from "./bankImport";

describe("parseOfx", () => {
  it("extracts transactions from STMTTRN blocks", () => {
    const ofx = `
<OFX>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260715120000
<TRNAMT>-45.90
<FITID>ABC123
<MEMO>Supermercado Pao de Acucar
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260716120000
<TRNAMT>1500.00
<FITID>ABC124
<MEMO>Salario
</STMTTRN>
</OFX>`;
    const result = parseOfx(ofx);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      date: "2026-07-15",
      amount: 45.9,
      type: "expense",
      fitId: "ABC123",
    });
    expect(result[1]).toMatchObject({
      date: "2026-07-16",
      amount: 1500,
      type: "income",
      fitId: "ABC124",
    });
  });
});

describe("parseCsv", () => {
  it("parses dates and period-decimal amounts with comma-separated columns", () => {
    const csv =
      "data,descricao,valor\n15/07/2026,Posto Shell,-180.00\n16/07/2026,Pix recebido,250.50";
    const result = parseCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ date: "2026-07-15", amount: 180, type: "expense" });
    expect(result[1]).toMatchObject({ date: "2026-07-16", amount: 250.5, type: "income" });
  });

  it("detects semicolon-separated CSVs", () => {
    const csv = "data;descricao;valor\n01/08/2026;Farmacia;-32,00";
    const result = parseCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(32);
  });

  it("P0-IMPORT-1 Etapa 4: a quoted Brazilian-format value survives a comma-delimited file intact", () => {
    const csv = 'data,descricao,valor\n05/08/2026,Item,"1.234,56"';
    const result = parseCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1234.56);
  });

  it("P0-IMPORT-1 Etapa 4: an unquoted Brazilian value in a comma CSV is rejected, never silently truncated", () => {
    const csv = "data,descricao,valor\n05/08/2026,Item,1.234,56";
    expect(() => parseCsv(csv)).toThrow(CsvFormatError);
    // the historical bug this guards against: this must NEVER resolve to 1.234
    try {
      parseCsv(csv);
    } catch (error) {
      expect(error).toBeInstanceOf(CsvFormatError);
    }
  });

  it("P0-IMPORT-1 Etapa 4: semicolon-delimited Brazilian value (unquoted) parses correctly", () => {
    const csv = "data;descricao;valor\n05/08/2026;Item;1.234,56";
    const result = parseCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(1234.56);
  });

  it("P0-IMPORT-1 Etapa 4: international decimal (1234.56) in a comma CSV", () => {
    const csv = "data,descricao,valor\n2026-08-05,Item,1234.56";
    const result = parseCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: "2026-08-05", amount: 1234.56 });
  });

  it("P0-IMPORT-1 Etapa 4: a row with a different column count than the header is rejected, not silently misaligned", () => {
    const csv = "data,descricao,valor\n05/08/2026,Bom,-10\n06/08/2026,Item,-10,extra";
    expect(() => parseCsv(csv)).toThrow(CsvFormatError);
  });

  it("does not throw on missing required columns — returns empty so the caller shows its own message", () => {
    expect(parseCsv("data,descricao\n05/08/2026,Sem valor")).toEqual([]);
    expect(parseCsv("descricao,valor\nSem data,-10")).toEqual([]);
  });
});

describe("isDuplicate", () => {
  it("matches by fitId when both sides have one", () => {
    const tx = {
      date: "2026-07-15",
      amount: 45.9,
      type: "expense" as const,
      description: "Mercado",
      fitId: "X1",
    };
    expect(isDuplicate(tx, [{ fitId: "X1", date: "2020-01-01", amount: 1, name: "outro" }])).toBe(
      true,
    );
  });

  it("falls back to date+amount+description when there is no fitId", () => {
    const tx = {
      date: "2026-07-15",
      amount: 45.9,
      type: "expense" as const,
      description: "Mercado",
    };
    expect(isDuplicate(tx, [{ date: "2026-07-15", amount: 45.9, name: "Mercado" }])).toBe(true);
    expect(isDuplicate(tx, [{ date: "2026-07-15", amount: 45.9, name: "Outra loja" }])).toBe(false);
  });

  it("P0-IMPORT-1 Etapa 3: two genuinely different transactions (different fitId) sharing date/amount/description are NOT treated as duplicates", () => {
    const tx = {
      date: "2026-08-05",
      amount: 8.5,
      type: "expense" as const,
      description: "Padaria",
      fitId: "BANK-002",
    };
    const existing = [{ date: "2026-08-05", amount: 8.5, name: "Padaria", fitId: "BANK-001" }];
    expect(isDuplicate(tx, existing)).toBe(false);
  });

  it("P0-IMPORT-1 Etapa 3: the same bank transaction id must not be imported twice", () => {
    const tx = {
      date: "2026-08-05",
      amount: 8.5,
      type: "expense" as const,
      description: "Padaria",
      fitId: "BANK-001",
    };
    const existing = [{ date: "2026-08-05", amount: 8.5, name: "Padaria", fitId: "BANK-001" }];
    expect(isDuplicate(tx, existing)).toBe(true);
  });

  it("P0-IMPORT-1 Etapa 3: fitId now actually reaches the dedup check via the real production shape (existing[] carries fitId from Expense.bankTransactionId)", () => {
    // Mirrors dialogs.tsx BankImportDialog.onFile building `existing` from
    // month.expenses.map(item => ({..., fitId: item.bankTransactionId})).
    const existingFromRealExpenses = [
      { date: "2026-08-05", amount: 8.5, name: "Padaria", fitId: "BANK-001" },
    ];
    const sameTransactionAgain = {
      date: "2026-08-05",
      amount: 8.5,
      type: "expense" as const,
      description: "Padaria",
      fitId: "BANK-001",
    };
    const genuinelyDifferentPurchase = {
      date: "2026-08-05",
      amount: 8.5,
      type: "expense" as const,
      description: "Padaria",
      fitId: "BANK-002",
    };
    expect(isDuplicate(sameTransactionAgain, existingFromRealExpenses)).toBe(true);
    expect(isDuplicate(genuinelyDifferentPurchase, existingFromRealExpenses)).toBe(false);
  });
});
