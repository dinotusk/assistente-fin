// @vitest-environment jsdom
// P0-05B round 2.1: the consent copy must describe the SELECTIVE context
// introduced in round 2 (categorias, metas, contas pendentes) without ever
// claiming a fixed bundle is always sent, without claiming nothing
// identifying leaves the app (responsavel, on a bill or goal, can be a real
// household member's name), and without an absolute "only what's necessary"
// promise the heuristic classifier can't strictly prove field-by-field.
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// SheetShell wraps vaul's Drawer, which needs browser APIs jsdom doesn't
// implement — swapped for a plain conditional render (same approach as
// ConflictDialog.test.tsx) so this test exercises the copy, not vaul.
vi.mock("./dialogs", () => ({
  SheetShell: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? (
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
}));

const mockFinance = {
  saveAiConsent: vi.fn().mockResolvedValue(undefined),
  revokeAiConsent: vi.fn().mockResolvedValue(undefined),
  getAiConsentStatus: vi.fn().mockResolvedValue({ granted: false, acceptedAt: null }),
};
vi.mock("@/lib/finance/FinanceContext", () => ({ useFinance: () => mockFinance }));

const { AiConsentDialog } = await import("./AiConsentDialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FORBIDDEN_PHRASES = [
  /nenhum dado financeiro (é|e) enviado/i,
  /somente o necess[aá]rio/i,
  /s[oó] o necess[aá]rio/i,
  /nunca enviamos seu nome/i,
];

function wholeDialogText() {
  return document.body.textContent || "";
}

describe("AiConsentDialog — request mode copy", () => {
  it("mentions categorias, metas and contas pendentes as things that can be sent", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="request" />);
    const text = wholeDialogText();
    expect(text).toMatch(/totais por categoria/i);
    expect(text).toMatch(/metas/i);
    expect(text).toMatch(/contas pendentes/i);
  });

  it("mentions responsável as part of what a bill can include — never claims names are never sent", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="request" />);
    expect(wholeDialogText()).toMatch(/responsável/i);
  });

  it("states email/password/internal ids/full history/prior conversations are never sent", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="request" />);
    const text = wholeDialogText();
    expect(text).toMatch(/e-mail/i);
    expect(text).toMatch(/senha/i);
    expect(text).toMatch(/identificadores internos/i);
    expect(text).toMatch(/hist[oó]rico completo/i);
    expect(text).toMatch(/conversas anteriores/i);
  });

  it("never uses any of the forbidden absolute phrasings", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="request" />);
    const text = wholeDialogText();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(text).not.toMatch(phrase);
    }
  });

  it("uses the approved request-mode title", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="request" />);
    expect(screen.getByText("Ativar respostas com IA")).toBeTruthy();
  });

  it("states the user can revoke at any time", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="request" />);
    expect(wholeDialogText()).toMatch(/revogar essa autoriza[cç][aã]o a qualquer momento/i);
  });
});

describe("AiConsentDialog — manage mode copy", () => {
  it('lists "Pode incluir" and "Não inclui" sections covering the real variants', () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="manage" />);
    const text = wholeDialogText();
    expect(text).toMatch(/pode incluir/i);
    expect(text).toMatch(/n[aã]o inclui/i);
    expect(text).toMatch(/totais por categoria/i);
    expect(text).toMatch(/metas e progresso/i);
    expect(text).toMatch(/contas pendentes/i);
    expect(text).toMatch(/respons[aá]vel/i);
  });

  it("the never-includes list covers email, password, internal ids, full history, prior conversations", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="manage" />);
    const text = wholeDialogText();
    expect(text).toMatch(/e-mail/i);
    expect(text).toMatch(/senha/i);
    expect(text).toMatch(/identificadores internos/i);
    expect(text).toMatch(/hist[oó]rico completo/i);
    expect(text).toMatch(/conversas anteriores/i);
  });

  it("never uses any of the forbidden absolute phrasings", () => {
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="manage" />);
    const text = wholeDialogText();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(text).not.toMatch(phrase);
    }
  });

  it("shows the revoke helper text only when already accepted", async () => {
    mockFinance.getAiConsentStatus.mockResolvedValue({
      granted: true,
      acceptedAt: "2026-08-10T00:00:00Z",
    });
    render(<AiConsentDialog open={true} onOpenChange={vi.fn()} mode="manage" />);
    expect(await screen.findByText(/volta a responder s[oó] com c[aá]lculos locais/i)).toBeTruthy();
  });
});
