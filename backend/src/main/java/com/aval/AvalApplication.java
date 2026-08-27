package com.aval;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class AvalApplication {

  public static void main(String[] args) {
    SpringApplication.run(AvalApplication.class, args);
  }
}
