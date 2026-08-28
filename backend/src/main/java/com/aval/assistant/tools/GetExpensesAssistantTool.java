package com.aval.assistant.tools;

import com.aval.assistant.orchestration.AssistantTool;
import com.aval.assistant.orchestration.JsonSchema;
import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpensePage;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.household.FinancialScope;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** {@code get_expenses} for the Assistant — thin adapter over {@link GetExpensesTool}. */
@Component
class GetExpensesAssistantTool implements AssistantTool {

  // Small, conservative default — the model reads a summary, not a full ledger dump; it can
  // ask again with a category/status filter or a later page if it genuinely needs more rows.
  private static final int DEFAULT_PAGE_SIZE = 10;

  private final GetExpensesTool tool;

  GetExpensesAssistantTool(GetExpensesTool tool) {
    this.tool = tool;
  }

  @Override
  public String name() {
    return "get_expenses";
  }

  @Override
  public String description() {
    return "Lista despesas/entradas de um mes/escopo, com filtros opcionais de categoria, status e tipo "
        + "(despesa ou renda). Renda nunca deve ser tratada como gasto. Use para responder perguntas sobre "
        + "lancamentos especificos, nunca invente uma despesa que nao veio desta ferramenta.";
  }

  @Override
  public Map<String, Object> inputSchema() {
    return JsonSchema.object(
        Map.of(
            "month", JsonSchema.string("Mes no formato YYYY-MM"),
            "scope", JsonSchema.stringEnum("Escopo dos dados", "me", "household", "profile"),
            "profileId", JsonSchema.string("UUID do perfil — obrigatorio quando scope=profile"),
            "category", JsonSchema.string("Filtro exato de categoria, opcional"),
            "status", JsonSchema.stringEnum("Filtro de status, opcional", "paid", "pending"),
            "entryType", JsonSchema.stringEnum("Filtro de tipo, opcional", "expense", "income"),
            "page", JsonSchema.integer("Pagina, 0-based, opcional (padrao 0)")),
        List.of("month", "scope"));
  }

  @Override
  public Object execute(ToolExecutionContext context, Map<String, Object> arguments) {
    YearMonth month = ToolRequestParsing.parseMonth(AssistantToolArguments.requireString(arguments, "month"));
    FinancialScope scope =
        ToolRequestParsing.parseScope(
            AssistantToolArguments.requireString(arguments, "scope"),
            AssistantToolArguments.optionalString(arguments, "profileId"));
    Optional<String> category = Optional.ofNullable(AssistantToolArguments.optionalString(arguments, "category"));
    Optional<ExpenseStatus> status = ToolRequestParsing.parseStatus(AssistantToolArguments.optionalString(arguments, "status"));
    Optional<EntryType> entryType =
        ToolRequestParsing.parseEntryType(AssistantToolArguments.optionalString(arguments, "entryType"));
    int page = AssistantToolArguments.optionalInt(arguments, "page", 0);

    ExpensePage result = tool.execute(context.user(), month, scope, category, status, entryType, page, DEFAULT_PAGE_SIZE);
    return ExpensesResponse.from(result);
  }
}
