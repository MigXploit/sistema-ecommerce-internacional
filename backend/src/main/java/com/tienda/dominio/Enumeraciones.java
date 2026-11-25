package com.tienda.dominio;

/**
 * Enumeraciones oficiales del Modelo de Dominio (Diagrama de Clases D02).
 */
public final class Enumeraciones {
    private Enumeraciones() {}

    public enum EstadoPedido {
        CREADO, PAGADO, PREPARADO, ENVIADO, ENTREGADO, DEVUELTO, CANCELADO
    }

    public enum EstadoPago {
        PENDIENTE, APROBADO, RECHAZADO, REEMBOLSADO
    }

    public enum EstadoEnvio {
        PENDIENTE, EN_TRANSITO, EN_ADUANA, ENTREGADO, DEVUELTO
    }

    public enum EstadoFactura {
        EMITIDA, ANULADA
    }

    public enum MedioPago {
        TARJETA, TRANSFERENCIA, BILLETERA_DIGITAL
    }

    public enum RolUsuario {
        GESTOR_CATALOGO,
        GESTOR_PEDIDOS,
        LOGISTICA,
        FACTURACION,
        ADMINISTRADOR,
        OFICIAL_SEGURIDAD,
        GERENTE
    }

    public enum Moneda {
        USD, BOB, EUR, BRL
    }

    public enum Idioma {
        ES, EN, PT
    }

    public enum TipoVenta {
        MINORISTA, MAYORISTA, PROMOCIONAL
    }
}
