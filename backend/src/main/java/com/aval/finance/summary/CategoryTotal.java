package com.aval.finance.summary;

import com.aval.finance.Money;

/** Mirrors calc.ts's {@code CategoryTotal} interface ({@code {category, total}}). */
public record CategoryTotal(String category, Money total) {}
