// @vitest-environment jsdom
// P0-FRONTEND-1C.1 — Minha conta, Dados pessoais, Segurança e acesso,
// Alterar senha, Membros da casa (somente leitura).
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActiveUser } from "@/lib/finance/types";

// SheetShell wraps vaul's Drawer, which needs browser APIs jsdom doesn't
// implement — swapped for a plain conditional render (same approach as
// ConflictDialog.test.tsx / AiConsentDialog.test.tsx) so these tests exercise
// the dialogs' own copy/wiring, not vaul.
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
  activeUser: { id: "user-1", name: "Oziel", email: "oziel@example.com" } as ActiveUser,
  logout: vi.fn(),
  updatePassword: vi.fn().mockResolvedValue(undefined),
  getLinkedProviders: vi.fn().mockResolvedValue(["email"]),
  listHouseholdMembers: vi.fn().mockResolvedValue([
    { userId: "user-1", role: "owner", joinedAt: "2026-07-26T00:00:00Z", isSelf: true },
    { userId: "user-2", role: "member", joinedAt: "2026-08-01T00:00:00Z", isSelf: false },
  ]),
};
vi.mock("@/lib/finance/FinanceContext", () => ({ useFinance: () => mockFinance }));

const { AccountDialog, ChangePasswordDialog, MembersDialog, PersonalDataDialog, SecurityDialog } =
  await import("./AccountDialogs");

beforeEach(() => {
  vi.clearAllMocks();
  mockFinance.activeUser = { id: "user-1", name: "Oziel", email: "oziel@example.com" };
  mockFinance.updatePassword.mockResolvedValue(undefined);
  mockFinance.getLinkedProviders.mockResolvedValue(["email"]);
  mockFinance.listHouseholdMembers.mockResolvedValue([
    { userId: "user-1", role: "owner", joinedAt: "2026-07-26T00:00:00Z", isSelf: true },
    { userId: "user-2", role: "member", joinedAt: "2026-08-01T00:00:00Z", isSelf: false },
  ]);
});
afterEach(() => cleanup());

describe("AccountDialog — Minha conta", () => {
  it("renders the account name and e-mail", () => {
    render(
      <AccountDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpenPersonalData={vi.fn()}
        onOpenSecurity={vi.fn()}
        onOpenMembers={vi.fn()}
        onOpenAiConsent={vi.fn()}
      />,
    );
    expect(screen.getByText("Oziel")).toBeTruthy();
    expect(screen.getByText("oziel@example.com")).toBeTruthy();
  });

  it("a missing e-mail never crashes the dialog — shows a fallback instead", () => {
    mockFinance.activeUser = { id: "user-1", name: "Oziel", email: null };
    render(
      <AccountDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpenPersonalData={vi.fn()}
        onOpenSecurity={vi.fn()}
        onOpenMembers={vi.fn()}
        onOpenAiConsent={vi.fn()}
      />,
    );
    expect(screen.getByText("E-mail não disponível")).toBeTruthy();
  });

  it("does not show a working 'Excluir conta' button — only an informational zona de perigo", () => {
    render(
      <AccountDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpenPersonalData={vi.fn()}
        onOpenSecurity={vi.fn()}
        onOpenMembers={vi.fn()}
        onOpenAiConsent={vi.fn()}
      />,
    );
    expect(screen.getByText("Zona de perigo")).toBeTruthy();
    expect(screen.queryByText("Excluir minha conta")).toBeNull();
    expect(screen.queryByRole("button", { name: /excluir/i })).toBeNull();
  });

  it("Sair calls logout", () => {
    render(
      <AccountDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpenPersonalData={vi.fn()}
        onOpenSecurity={vi.fn()}
        onOpenMembers={vi.fn()}
        onOpenAiConsent={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Sair"));
    expect(mockFinance.logout).toHaveBeenCalledTimes(1);
  });

  it("rows call their respective onOpen callbacks", () => {
    const onOpenPersonalData = vi.fn();
    const onOpenSecurity = vi.fn();
    const onOpenMembers = vi.fn();
    const onOpenAiConsent = vi.fn();
    render(
      <AccountDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpenPersonalData={onOpenPersonalData}
        onOpenSecurity={onOpenSecurity}
        onOpenMembers={onOpenMembers}
        onOpenAiConsent={onOpenAiConsent}
      />,
    );
    fireEvent.click(screen.getByText("Dados pessoais"));
    fireEvent.click(screen.getByText("Segurança e acesso"));
    fireEvent.click(screen.getByText("Casa e membros"));
    fireEvent.click(screen.getByText("Privacidade e IA"));
    expect(onOpenPersonalData).toHaveBeenCalledTimes(1);
    expect(onOpenSecurity).toHaveBeenCalledTimes(1);
    expect(onOpenMembers).toHaveBeenCalledTimes(1);
    expect(onOpenAiConsent).toHaveBeenCalledTimes(1);
  });
});

describe("PersonalDataDialog — read-only", () => {
  it("shows name and e-mail, with no editable input", () => {
    render(<PersonalDataDialog open={true} onOpenChange={vi.fn()} />);
    const nameInput = screen.getByDisplayValue("Oziel") as HTMLInputElement;
    const emailInput = screen.getByDisplayValue("oziel@example.com") as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);
    expect(emailInput.disabled).toBe(true);
  });
});

describe("SecurityDialog — status only, no false claims", () => {
  it("shows Conectado when google is linked", async () => {
    mockFinance.getLinkedProviders.mockResolvedValue(["email", "google"]);
    render(<SecurityDialog open={true} onOpenChange={vi.fn()} onOpenChangePassword={vi.fn()} />);
    expect(await screen.findByText("Conectado")).toBeTruthy();
  });

  it("shows Não conectado when google is not linked", async () => {
    mockFinance.getLinkedProviders.mockResolvedValue(["email"]);
    render(<SecurityDialog open={true} onOpenChange={vi.fn()} onOpenChangePassword={vi.fn()} />);
    expect(await screen.findByText("Não conectado")).toBeTruthy();
  });

  it("Alterar senha row opens the password dialog", async () => {
    const onOpenChangePassword = vi.fn();
    render(
      <SecurityDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpenChangePassword={onOpenChangePassword}
      />,
    );
    await screen.findByText(/conectado/i);
    fireEvent.click(screen.getByText("Alterar senha"));
    expect(onOpenChangePassword).toHaveBeenCalledTimes(1);
  });

  it("Sair deste aparelho still calls logout", async () => {
    render(<SecurityDialog open={true} onOpenChange={vi.fn()} onOpenChangePassword={vi.fn()} />);
    await screen.findByText(/conectado/i);
    fireEvent.click(screen.getByText("Sair deste aparelho"));
    expect(mockFinance.logout).toHaveBeenCalledTimes(1);
  });
});

describe("ChangePasswordDialog", () => {
  function fillAndSubmit(password: string, confirm: string) {
    fireEvent.change(screen.getByPlaceholderText("Mínimo de 6 caracteres"), {
      target: { value: password },
    });
    fireEvent.change(screen.getByPlaceholderText("Repita a nova senha"), {
      target: { value: confirm },
    });
    fireEvent.click(screen.getByText("Salvar"));
  }

  it("success: calls updatePassword with the new password and shows confirmation", async () => {
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />);
    fillAndSubmit("nova-senha-123", "nova-senha-123");
    await waitFor(() => expect(mockFinance.updatePassword).toHaveBeenCalledWith("nova-senha-123"));
    expect(await screen.findByText("Senha alterada com sucesso.")).toBeTruthy();
  });

  it("mismatched confirmation is rejected before calling updatePassword", () => {
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />);
    fillAndSubmit("nova-senha-123", "outra-coisa");
    expect(screen.getByText("As senhas não coincidem.")).toBeTruthy();
    expect(mockFinance.updatePassword).not.toHaveBeenCalled();
  });

  it("too-short password is rejected before calling updatePassword", () => {
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />);
    fillAndSubmit("abc", "abc");
    expect(screen.getByText(/pelo menos 6 caracteres/)).toBeTruthy();
    expect(mockFinance.updatePassword).not.toHaveBeenCalled();
  });

  it("error: keeps the form filled and shows the error, never a silent failure", async () => {
    mockFinance.updatePassword.mockRejectedValue(new Error("Sessão expirada."));
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />);
    fillAndSubmit("nova-senha-123", "nova-senha-123");
    expect(await screen.findByText("Sessão expirada.")).toBeTruthy();
    const passwordInput = screen.getByPlaceholderText("Mínimo de 6 caracteres") as HTMLInputElement;
    expect(passwordInput.value).toBe("nova-senha-123");
  });

  it("disables inputs and shows Salvando... while the request is in flight", async () => {
    let resolveUpdate: () => void = () => {};
    mockFinance.updatePassword.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />);
    fillAndSubmit("nova-senha-123", "nova-senha-123");

    expect(await screen.findByText("Salvando...")).toBeTruthy();
    const passwordInput = screen.getByPlaceholderText("Mínimo de 6 caracteres") as HTMLInputElement;
    expect(passwordInput.disabled).toBe(true);

    resolveUpdate();
    await waitFor(() => expect(screen.getByText("Senha alterada com sucesso.")).toBeTruthy());
  });

  it("never auto-closes on success — onOpenChange is only called by an explicit user action", async () => {
    const onOpenChange = vi.fn();
    render(<ChangePasswordDialog open={true} onOpenChange={onOpenChange} />);
    fillAndSubmit("nova-senha-123", "nova-senha-123");
    await screen.findByText("Senha alterada com sucesso.");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // P0-FRONTEND-1B.6 — footer normalized to glass-surface; the password
  // inputs themselves must never carry a glass- utility.
  it("the footer carries glass-surface (P0-FRONTEND-1B.6)", () => {
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />);
    const footer = screen.getByText("Salvar").closest("div");
    expect(footer?.className).toContain("glass-surface");
  });

  it("password inputs never carry a glass- utility (P0-FRONTEND-1B.6)", () => {
    render(<ChangePasswordDialog open={true} onOpenChange={vi.fn()} />);
    const passwordInput = screen.getByPlaceholderText("Mínimo de 6 caracteres");
    expect(passwordInput.className).not.toMatch(/glass-/);
  });
});

describe("MembersDialog — read-only", () => {
  it("shows the caller's own name and e-mail, marked as (você)", async () => {
    render(<MembersDialog open={true} onOpenChange={vi.fn()} />);
    expect(await screen.findByText("Oziel")).toBeTruthy();
    expect(screen.getByText("(você)")).toBeTruthy();
    expect(screen.getByText("oziel@example.com")).toBeTruthy();
  });

  it("never shows a name or e-mail for another member — only role and join date", async () => {
    render(<MembersDialog open={true} onOpenChange={vi.fn()} />);
    await screen.findByText("Oziel");
    expect(screen.queryByText(/@/)).toBeTruthy(); // only the self row's e-mail
    expect(screen.getAllByText(/@/).length).toBe(1);
    expect(screen.getByText(/Membro · desde/)).toBeTruthy();
  });

  it("offers no remove/role-change action — pure read-only", async () => {
    render(<MembersDialog open={true} onOpenChange={vi.fn()} />);
    await screen.findByText("Oziel");
    expect(screen.queryByText(/remover/i)).toBeNull();
    expect(screen.queryByText(/transferir/i)).toBeNull();
  });
});
