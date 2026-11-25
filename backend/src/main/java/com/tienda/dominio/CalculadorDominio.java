package com.tienda.dominio;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Motores de cálculo y fórmulas cuantitativas del dominio (Sección 7.5.5).
 * Cumple RN01, RN02, RN07, RN09, RN10.
 */
public final class CalculadorDominio {
    private CalculadorDominio() {}

    private static final BigDecimal DIVISOR_VOLUMETRICO = new BigDecimal("5000");

    /**
     * Fórmula 1: Precio_Moneda = Redondear(Precio_Base_USD * Tasa_USD_a_Moneda, 2)
     */
    public static BigDecimal convertirDesdeUsd(BigDecimal montoUsd, BigDecimal tasa) {
        return montoUsd.multiply(tasa).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Fórmula 4b: Equivalente_Base_USD = Monto_Cobrado / Tasa_USD_a_Moneda
     */
    public static BigDecimal calcularEquivalenteUsd(BigDecimal montoMoneda, BigDecimal tasa) {
        if (tasa == null || tasa.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("La tasa de cambio debe ser mayor a cero.");
        }
        return montoMoneda.divide(tasa, 2, RoundingMode.HALF_UP);
    }

    /**
     * Fórmula 2a: Peso Volumétrico (kg) = (Largo * Ancho * Alto) / 5000
     * Formato esperado de dimensiones: "35x25x8" (cm).
     */
    public static BigDecimal calcularPesoVolumetricoKg(String dimensiones) {
        if (dimensiones == null || dimensiones.isBlank()) {
            return BigDecimal.ZERO;
        }
        String[] partes = dimensiones.toLowerCase().replace("cm", "").trim().split("[x*]");
        if (partes.length != 3) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal largo = new BigDecimal(partes[0].trim());
            BigDecimal ancho = new BigDecimal(partes[1].trim());
            BigDecimal alto = new BigDecimal(partes[2].trim());
            return largo.multiply(ancho).multiply(alto).divide(DIVISOR_VOLUMETRICO, 3, RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    /**
     * Fórmula 2b: Peso Tasable = max(Peso Físico Total, Peso Volumétrico Total)
     */
    public static BigDecimal calcularPesoTasable(BigDecimal pesoFisicoTotal, BigDecimal pesoVolumetricoTotal) {
        return pesoFisicoTotal.max(pesoVolumetricoTotal).setScale(3, RoundingMode.HALF_UP);
    }

    /**
     * Máquina de estados estricta del Pedido (RN05 / Diagrama D08).
     */
    public static boolean esTransicionPedidoValida(String actual, String destino) {
        return switch (actual) {
            case "CREADO" -> "PAGADO".equals(destino) || "CANCELADO".equals(destino);
            case "PAGADO" -> "PREPARADO".equals(destino) || "ENVIADO".equals(destino) || "CANCELADO".equals(destino);
            case "PREPARADO" -> "ENVIADO".equals(destino);
            case "ENVIADO" -> "ENTREGADO".equals(destino) || "DEVUELTO".equals(destino);
            case "ENTREGADO" -> "DEVUELTO".equals(destino);
            default -> false;
        };
    }

    /**
     * Máquina de estados estricta del Envío Internacional (Diagrama D09).
     */
    public static boolean esTransicionEnvioValida(String actual, String destino) {
        return switch (actual) {
            case "PENDIENTE" -> "EN_TRANSITO".equals(destino);
            case "EN_TRANSITO" -> "EN_ADUANA".equals(destino) || "ENTREGADO".equals(destino) || "DEVUELTO".equals(destino);
            case "EN_ADUANA" -> "EN_TRANSITO".equals(destino) || "DEVUELTO".equals(destino);
            default -> false;
        };
    }
}
