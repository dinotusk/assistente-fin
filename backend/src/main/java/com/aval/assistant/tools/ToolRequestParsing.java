package com.aval.assistant.tools;

import com.aval.finance.expenses.EntryType;
import com.aval.finance.expenses.ExpenseStatus;
import com.aval.household.FinancialScope;
import com.aval.platform.errors.ApiErrorType;
import com.aval.platform.errors.ApiException;
import java.time.DateTimeException;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.UUID;

/**
 * Request parsing shared by the five {@code /api/v1/tools/*} controllers — the same {@code
 * month}/{@code scope}/{@code profileId} rules {@link
 * com.aval.finance.summary.FinancialSummaryController} already enforces for {@code
 * GET /api/v1/financial-summary}, extracted here so five new controllers don't each hand-roll a
 * copy. {@code FinancialSummaryController} itself is intentionally left untouched (P2, already
 * tested) rather than retrofitted onto this class.
 */
final class ToolRequestParsing {

  private static final DateTimeFormatter MONTH_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");

  private ToolRequestParsing() {}

  static YearMonth parseMonth(String month) {
    try {
      return YearMonth.parse(month, MONTH_FORMAT);
    } catch (DateTimeException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "month deve estar no formato YYYY-MM.");
    }
  }

  static FinancialScope parseScope(String scope, String profileId) {
    return switch (scope) {
      case "household" -> new FinancialScope.Household();
      case "me" -> new FinancialScope.Me();
      case "profile" -> new FinancialScope.Profile(parseProfileId(profileId));
      default -> throw new ApiException(
          ApiErrorType.VALIDATION_ERROR, "scope deve ser um de: me, household, profile.");
    };
  }

  private static UUID parseProfileId(String profileId) {
    if (profileId == null || profileId.isBlank()) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "profileId é obrigatório quando scope=profile.");
    }
    try {
      return UUID.fromString(profileId);
    } catch (IllegalArgumentException e) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "profileId deve ser um UUID válido.");
    }
  }

  static Optional<ExpenseStatus> parseStatus(String status) {
    if (status == null || status.isBlank()) return Optional.empty();
    return Optional.of(
        switch (status) {
          case "paid" -> ExpenseStatus.PAID;
          case "pending" -> ExpenseStatus.PENDING;
          default -> throw new ApiException(
              ApiErrorType.VALIDATION_ERROR, "status deve ser um de: paid, pending.");
        });
  }

  static Optional<EntryType> parseEntryType(String entryType) {
    if (entryType == null || entryType.isBlank()) return Optional.empty();
    return Optional.of(
        switch (entryType) {
          case "expense" -> EntryType.EXPENSE;
          case "income" -> EntryType.INCOME;
          default -> throw new ApiException(
              ApiErrorType.VALIDATION_ERROR, "entryType deve ser um de: expense, income.");
        });
  }

  static int parsePage(Integer page) {
    int value = page != null ? page : 0;
    if (value < 0) throw new ApiException(ApiErrorType.VALIDATION_ERROR, "page deve ser >= 0.");
    return value;
  }

  static int parsePageSize(Integer pageSize) {
    int value = pageSize != null ? pageSize : 50;
    if (value < 1 || value > 200) {
      throw new ApiException(ApiErrorType.VALIDATION_ERROR, "pageSize deve estar entre 1 e 200.");
    }
    return value;
  }
}
