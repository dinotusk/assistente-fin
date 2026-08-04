import { createFileRoute } from "@tanstack/react-router";

import { TermsPage } from "@/components/app/TermsPage";

export const Route = createFileRoute("/termos")({
  component: TermsPage,
});
