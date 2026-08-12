// @vitest-environment jsdom
// P0-PRIVACY-COOKIES — a auditoria provou que o Aval não define nenhum cookie e
// não carrega analytics/rastreamento, então NÃO existe categoria opcional a
// consentir. Estes testes travam as duas metades dessa decisão: (a) a página de
// privacidade descreve o armazenamento real, e (b) o app não finge um
// consentimento que não tem o que controlar (nada de "Aceitar todos"/"Rejeitar").
// Se um dia entrar analytics, o teste 5 falha de propósito — é o gatilho para
// introduzir um mecanismo de consentimento de verdade.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// TermsPage é uma página de conteúdo; o <Link> do router não é o objeto do teste
// e exigiria um router completo só para renderizar dois links de navegação.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { TermsPage } from "./TermsPage";

afterEach(() => cleanup());

describe("TermsPage — transparência de armazenamento (P0-PRIVACY-COOKIES)", () => {
  it("1. tem uma seção dedicada a cookies e armazenamento no navegador", () => {
    render(<TermsPage />);
    expect(screen.getByText(/Cookies e armazenamento no navegador/i)).toBeTruthy();
  });

  it("2. afirma explicitamente que o Aval não utiliza cookies", () => {
    render(<TermsPage />);
    expect(screen.getByText(/O Aval não utiliza cookies\./i)).toBeTruthy();
  });

  it("3. afirma que não há analytics, publicidade ou rastreamento", () => {
    render(<TermsPage />);
    expect(screen.getByText(/analytics.*publicidade ou rastreamento/i)).toBeTruthy();
  });

  it("4. distingue localStorage/sessionStorage de cookies em vez de tratar como sinônimos", () => {
    render(<TermsPage />);
    expect(screen.getByText(/tecnologia diferente de cookies/i)).toBeTruthy();
  });

  it("5. explica que a IA é chamada pelo servidor, não pelo navegador do usuário", () => {
    render(<TermsPage />);
    expect(screen.getByText(/não fala diretamente com o provedor de IA/i)).toBeTruthy();
  });

  it("6. explica como apagar o armazenamento sem perder os dados da conta", () => {
    render(<TermsPage />);
    expect(screen.getByText(/dados de navegação do seu navegador/i)).toBeTruthy();
  });

  it("7. a seção de cookies é endereçável por âncora (/termos#cookies)", () => {
    const { container } = render(<TermsPage />);
    expect(container.querySelector("#cookies")).toBeTruthy();
  });

  it("8. não apresenta um banner/botões de consentimento de cookies — não há opcional a controlar", () => {
    render(<TermsPage />);
    expect(screen.queryByText(/Aceitar todos/i)).toBeNull();
    expect(screen.queryByText(/Rejeitar opcionais/i)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
