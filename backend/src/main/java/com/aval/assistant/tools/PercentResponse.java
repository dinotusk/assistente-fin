package com.aval.assistant.tools;

import com.aval.finance.Percent;

/**
 * Wire shape for {@link Percent} — never a bare JSON number, so a consumer can never mistake
 * {@code {"status":"NOT_APPLICABLE"}} for a real {@code 0}. {@code value} is a decimal string
 * (e.g. {@code "25.00"}, meaning 25%), present only when {@code status} is {@code "OK"}.
 */
public record PercentResponse(String status, String value) {

  public static PercentResponse from(Percent percent) {
    return switch (percent) {
      case Percent.Value(var p) -> new PercentResponse("OK", p.toPlainString());
      case Percent.NotApplicable ignored -> new PercentResponse("NOT_APPLICABLE", null);
    };
  }
}
