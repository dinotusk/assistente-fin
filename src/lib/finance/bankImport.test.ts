import { describe, expect, it } from "vitest";

import { isDuplicate, parseCsv, parseOfx } from "./bankImport";

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
});
