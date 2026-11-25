package com.tienda;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(proxyBeanMethods = false)
public class EcommerceInternacionalApplication {
    public static void main(String[] args) {
        SpringApplication.run(EcommerceInternacionalApplication.class, args);
    }
}
