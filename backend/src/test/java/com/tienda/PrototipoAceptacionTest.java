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

        // 5. Gerente consulta reporte multidimensional filtrado (CU12 / CA-FUNC-10)
        String tokenGerente = login("gerencia", "Gerencia2026!", "INTERNO");
        mvc.perform(get("/api/reportes/multidimensional?pais=BR&tipoVenta=MINORISTA&idioma=PT&moneda=BRL")
                        .header("Authorization", "Bearer " + tokenGerente))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cantidadRegistros").isNumber());
    }
}
