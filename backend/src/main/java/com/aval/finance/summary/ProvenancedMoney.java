package com.aval.finance.summary;

import com.aval.finance.Money;

public record ProvenancedMoney(Money value, Provenance provenance) {

  public static ProvenancedMoney calculated(Money value) {
    return new ProvenancedMoney(value, Provenance.CALCULATED);
  }
}
