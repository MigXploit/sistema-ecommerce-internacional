package com.tienda;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.context.web.ServletTestExecutionListener;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Verificación automatizada de Criterios de Aceptación del Prototipo (Secciones 11.3 y 14).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("demo")
@TestExecutionListeners({
        ServletTestExecutionListener.class,
        DependencyInjectionTestExecutionListener.class
})
class PrototipoAceptacionTest {

    @Autowired
    private MockMvc mvc;

    private final ObjectMapper mapper = new ObjectMapper();

    private String login(String identificador, String clave, String tipoCuenta) throws Exception {
        String body = mapper.writeValueAsString(Map.of(
                "identificador", identificador,
                "clave", clave,
                "tipoCuenta", tipoCuenta
        ));
        String resp = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return (String) mapper.readValue(resp, Map.class).get("token");
    }

    @Test
    void segregacionSeguridadRn20YHasheoBcrypt() throws Exception {
        // 1. Administrador de Parámetros NO puede acceder al Módulo Independiente de Seguridad (RN20 / CA-FUNC-12)
        String tokenAdmin = login("admin.parametros", "AdminParam2026!", "INTERNO");
        mvc.perform(get("/api/seguridad/usuarios")
                        .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isForbidden());

        // 2. Oficial de Seguridad SÍ accede a usuarios y bitácora inmutable (CU14 / CA-FUNC-11)
        String tokenSeg = login("seguridad", "Seguridad2026!", "INTERNO");
        String respUsuarios = mvc.perform(get("/api/seguridad/usuarios")
                        .header("Authorization", "Bearer " + tokenSeg))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(respUsuarios).contains("$2a$12$");

        // 3. Usuario desactivado lógicamente no puede ingresar (RN18)
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "identificador", "ex.operador",
                                "clave", "Inactivo2026!",
                                "tipoCuenta", "INTERNO"
                        ))))
                .andExpect(status().isForbidden());
    }

    @Test
    void flujoCompletoMultimonedaPedidoPagoGuiaYDevolucionDefecto() throws Exception {
        // 1. Catálogo en Portugués y Reales Brasileños coincide con Diagrama D13 (120 USD * 5.00 = 600.00 BRL)
        String catResp = mvc.perform(get("/api/catalogo?idioma=PT&moneda=BRL"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(catResp).contains("Jaqueta de alpaca").contains("600.0");

        // 2. Cliente compra en 4 pasos: Cotización -> Pedido CREADO -> Pago Tokenizado -> Factura EMITIDA
        String tokenCliente = login("carla.santos@email.br", "Cliente2026!", "CLIENTE");
        String pedidoBody = mapper.writeValueAsString(Map.of(
                "idDireccion", 1,
                "moneda", "BRL",
                "idiomaOperacion", "PT",
                "tipoVenta", "MINORISTA",
                "codigoOperador", "COURIER_GLOBAL",
                "items", List.of(Map.of("idProducto", 1, "cantidad", 1))
        ));
        String pedResp = mvc.perform(post("/api/pedidos")
                        .header("Authorization", "Bearer " + tokenCliente)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pedidoBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int idPedido = ((Number) mapper.readValue(pedResp, Map.class).get("idPedido")).intValue();

        // Rechazo PCI DSS si alguien envía PAN/CVV (RN11)
        mvc.perform(post("/api/pagos/procesar")
                        .header("Authorization", "Bearer " + tokenCliente)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "idPedido", idPedido,
                                "medioPago", "TARJETA",
                                "tokenPago", "tok_test",
                                "numeroTarjetaProhibido", "4111222233334444"
                        ))))
                .andExpect(status().isBadRequest());

        // Cobro tokenizado válido -> PAGADO + Factura Comercial
        mvc.perform(post("/api/pagos/procesar")
                        .header("Authorization", "Bearer " + tokenCliente)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "idPedido", idPedido,
                                "medioPago", "TARJETA",
                                "tokenPago", "tok_valid_br_123"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estadoPago").value("APROBADO"));

        // 3. Logística emite guía internacional en 1 clic (CU07)
        String tokenLog = login("logistica", "Logistica2026!", "INTERNO");
        mvc.perform(post("/api/envios/gestion/emitir-guia")
                        .header("Authorization", "Bearer " + tokenLog)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("idPedido", idPedido, "operador", "Courier Global"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.numeroGuia").exists());

        // 4. Devolución por PRODUCTO_DEFECTUOSO sobre pedido #3 (ENTREGADO): sin evidencia se bloquea (RN19)
        String tokenSofia = login("sofia.garcia@importaciones.es", "Cliente2026!", "CLIENTE");
        mvc.perform(post("/api/postventa/solicitar-devolucion")
                        .header("Authorization", "Bearer " + tokenSofia)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "idPedido", 3,
                                "idProductoAfectado", 4,
                                "unidadesDefectuosas", 1,
                                "causalDevolucion", "PRODUCTO_DEFECTUOSO",
                                "motivo", "Costura dañada",
                                "evidenciaRef", ""
                        ))))
                .andExpect(status().isBadRequest());

        // Con evidencia válida -> Gestor de Pedidos aprueba, aísla stock y emite Nota de Crédito (CU11 + CU06 + CU09)
        String devResp = mvc.perform(post("/api/postventa/solicitar-devolucion")
                        .header("Authorization", "Bearer " + tokenSofia)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "idPedido", 3,
                                "idProductoAfectado", 4,
                                "unidadesDefectuosas", 1,
                                "causalDevolucion", "PRODUCTO_DEFECTUOSO",
                                "motivo", "Costura dañada comprobada",
                                "evidenciaRef", "EVID-ES-2026-99.jpg"
                        ))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int idReembolso = ((Number) mapper.readValue(devResp, Map.class).get("idReembolso")).intValue();

        String tokenGestorPed = login("pedidos", "Pedidos2026!", "INTERNO");
        mvc.perform(post("/api/postventa/gestion/resolver/" + idReembolso)
                        .header("Authorization", "Bearer " + tokenGestorPed)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of("aprobar", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notaCredito.tipo_documento").value("NOTA_CREDITO"));

        // 5. Gerente consulta tablero estadístico y reporte multidimensional filtrado (CU12 / CA-FUNC-10)
        String tokenGerente = login("gerencia", "Gerencia2026!", "INTERNO");
        mvc.perform(get("/api/reportes/estadisticas")
                        .header("Authorization", "Bearer " + tokenGerente))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ingresosConsolidadosUsd").exists())
                .andExpect(jsonPath("$.rankingProductosDemandados").isArray());

        mvc.perform(get("/api/reportes/multidimensional?pais=BR&tipoVenta=MINORISTA&idioma=PT&moneda=BRL")
                        .header("Authorization", "Bearer " + tokenGerente))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cantidadRegistros").isNumber());

        // 6. Verificar Bandeja Logística, Facturación Inmutable y sincronización de Catálogo
        mvc.perform(get("/api/envios/gestion/bandeja")
                        .header("Authorization", "Bearer " + tokenLog))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.despachos").isArray());

        String tokenFac = login("facturacion", "Factura2026!", "INTERNO");
        mvc.perform(get("/api/facturacion/gestion")
                        .header("Authorization", "Bearer " + tokenFac))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/facturacion/gestion/1")
                        .header("Authorization", "Bearer " + tokenFac))
                .andExpect(status().isConflict());

        String tokenCat = login("catalogo", "Catalogo2026!", "INTERNO");
        mvc.perform(post("/api/catalogo/sincronizar-tasas")
                        .header("Authorization", "Bearer " + tokenCat))
                .andExpect(status().isOk());
    }

    @Test
    void seguimientoLogisticoPublicoYEndpointsCompletosAl100() throws Exception {
        // 1. Seguimiento logístico autenticado y aislamiento por titular / rol (CU08 / RF15 / RNF02)
        mvc.perform(get("/api/envios/seguimiento/CG-2026-000731"))
                .andExpect(status().isUnauthorized());

        String tokenCarla = login("carla.santos@email.br", "Cliente2026!", "CLIENTE");
        mvc.perform(get("/api/envios/seguimiento/CG-2026-000731")
                        .header("Authorization", "Bearer " + tokenCarla))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.numero_guia").value("CG-2026-000731"))
                .andExpect(jsonPath("$.eventos").isArray())
                .andExpect(jsonPath("$.detalles").isArray());

        String tokenDiego = login("diego.rojas@comercio.bo", "Cliente2026!", "CLIENTE");
        mvc.perform(get("/api/envios/seguimiento/CG-2026-000731")
                        .header("Authorization", "Bearer " + tokenDiego))
                .andExpect(status().isForbidden());

        String tokenLog = login("logistica", "Logistica2026!", "INTERNO");
        mvc.perform(get("/api/envios/seguimiento/CG-2026-000731")
                        .header("Authorization", "Bearer " + tokenLog))
                .andExpect(status().isOk());

        mvc.perform(get("/api/envios/seguimiento/GUIA-INEXISTENTE-999")
                        .header("Authorization", "Bearer " + tokenLog))
                .andExpect(status().isNotFound());

        // 2. Filtro de rango de precio (precioMin y precioMax - RF04)
        mvc.perform(get("/api/catalogo?idioma=ES&moneda=USD&precioMin=50&precioMax=200"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        // 3. Perfil de cliente exclusivo de CLIENTE (RF05) y aislamiento de pedidos para otros roles
        mvc.perform(get("/api/clientes/perfil")
                        .header("Authorization", "Bearer " + tokenDiego))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pais").value("BO"));

        String tokenCat = login("catalogo", "Catalogo2026!", "INTERNO");
        mvc.perform(get("/api/pedidos")
                        .header("Authorization", "Bearer " + tokenCat))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/clientes/mis-notificaciones")
                        .header("Authorization", "Bearer " + tokenCat))
                .andExpect(status().isForbidden());

        // 4. Contingencia de tipo de cambio RN03 (simularFallaProveedor=true)
        mvc.perform(post("/api/catalogo/sincronizar-tasas?simularFallaProveedor=true")
                        .header("Authorization", "Bearer " + tokenCat))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alertaFallbackRn03").value(true));

        // 5. Reporte multidimensional con rango de fechas (CU12)
        String tokenGerente = login("gerencia", "Gerencia2026!", "INTERNO");
        mvc.perform(get("/api/reportes/multidimensional?pais=TODOS&fechaDesde=2025-01-01&fechaHasta=2027-12-31")
                        .header("Authorization", "Bearer " + tokenGerente))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cantidadRegistros").isNumber());

        // 6. Parámetros operativos completos: aranceles HS, operadores e idiomas (CU13 / RNF09)
        String tokenAdmin = login("admin.parametros", "AdminParam2026!", "INTERNO");
        mvc.perform(get("/api/envios/seguimiento/CG-2026-000731")
                        .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/parametros/aranceles")
                        .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        mvc.perform(post("/api/parametros/aranceles")
                        .header("Authorization", "Bearer " + tokenAdmin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "codigoPais", "BR",
                                "codigoArancelario", "6201.99",
                                "tasaArancel", 0.14,
                                "restringido", false
                        ))))
                .andExpect(status().isOk());

        mvc.perform(post("/api/parametros/operadores")
                        .header("Authorization", "Bearer " + tokenAdmin)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(Map.of(
                                "codigoOperador", "FEDEX_INTL",
                                "nombre", "FedEx International Priority",
                                "tarifaBaseUsd", 28.00,
                                "diasEstimados", 4,
                                "activo", true
                        ))))
                .andExpect(status().isOk());
    }
}
