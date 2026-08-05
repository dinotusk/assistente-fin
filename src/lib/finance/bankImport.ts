// OFX/CSV bank statement parsing (FUNCOES-A-IMPLEMENTAR.md section 3).
// Open Finance is out of scope; this is the "import a file the bank gives you" fallback.
import { normalizeText } from "./calc";

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  amount: number; // always positive
  type: "income" | "expense";
  description: string;
  fitId?: string;
}

export interface ExistingFingerprint {
  fitId?: string;
  date: string;
  amount: number;
  name: string;
}

function fingerprint(date: string, amount: number, description: string): string {
  return `${date}|${amount.toFixed(2)}|${normalizeText(description)}`;
}

/** True if this parsed transaction matches something already in the ledger. */
export function isDuplicate(tx: ParsedTransaction, existing: ExistingFingerprint[]): boolean {
  return existing.some((item) => {
    if (tx.fitId && item.fitId) return tx.fitId === item.fitId;
    return (
      fingerprint(tx.date, tx.amount, tx.description) ===
      fingerprint(item.date, item.amount, item.name)
    );
  });
}

export function parseOfx(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const block of blocks) {
    const body = block.split(/<\/STMTTRN>/i)[0];
    const amountRaw = extractOfxTag(body, "TRNAMT");
    const dateRaw = extractOfxTag(body, "DTPOSTED");
    const memo =
      extractOfxTag(body, "MEMO") || extractOfxTag(body, "NAME") || "Lançamento importado";
    const fitId = extractOfxTag(body, "FITID") || undefined;
    if (!amountRaw || !dateRaw) continue;

    const amount = Number(amountRaw.replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) continue;

    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
    transactions.push({
      date,
      amount: Math.abs(amount),
      type: amount < 0 ? "expense" : "income",
      description: memo.trim(),
      fitId,
    });
  }
  return transactions;
}

function extractOfxTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return match ? match[1].trim() : "";
}

export function parseCsv(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const separator =
    (lines[0].match(/;/g)?.length || 0) > (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
  const headers = lines[0].split(separator).map((h) => normalizeText(h.trim()));
  const dateIndex = headers.findIndex((h) => ["data", "date"].includes(h));
  const descIndex = headers.findIndex((h) => ["descricao", "historico", "description"].includes(h));
  const amountIndex = headers.findIndex((h) => ["valor", "amount"].includes(h));
  if (dateIndex < 0 || amountIndex < 0) return [];

  const transactions: ParsedTransaction[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(separator).map((c) => c.trim().replace(/^"|"$/g, ""));
    const rawAmount = cells[amountIndex] || "";
    const amount = parseBrazilianAmount(rawAmount);
    const date = normalizeCsvDate(cells[dateIndex] || "");
    if (!date || !Number.isFinite(amount) || amount === 0) continue;

    transactions.push({
      date,
      amount: Math.abs(amount),
      type: amount < 0 ? "expense" : "income",
      description: (cells[descIndex] || "Lançamento importado").trim(),
    });
  }
  return transactions;
}

function parseBrazilianAmount(value: string): number {
  const clean = value.replace(/[^\d,.-]/g, "");
  if (!clean) return NaN;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  return Number(normalized);
}

function normalizeCsvDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, d, m, y] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}
