package com.tienda.parametros;

import com.tienda.seguridad.FiltroSeguridadRbac;
import com.tienda.seguridad.ServicioAuditoria;
import com.tienda.seguridad.ServicioJwtRs256;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Módulo de Administración de Parámetros Operativos (CU13, RF22, RNF09, RN20).
 * Separado estrictamente del módulo de Seguridad: configura países, monedas, idiomas,
 * tasas impositivas y operadores logísticos sin acceso a claves ni auditoría.
 */
@RestController
public class ControladorParametros {

    private final JdbcTemplate jdbc;
    private final ServicioAuditoria auditoria;

    public ControladorParametros(JdbcTemplate jdbc, ServicioAuditoria auditoria) {
        this.jdbc = jdbc;
        this.auditoria = auditoria;
    }

    @GetMapping("/api/salud")
    public Map<String, Object> saludSistema() {
        return Map.of("estado", "OPERATIVO", "sistema", "Comercio Electrónico Internacional - Grupo 12");
    }

    @GetMapping("/api/parametros/publicos")
    public Map<String, Object> obtenerParametrosPublicos() {
        var monedas = jdbc.queryForList("SELECT * FROM param_moneda WHERE habilitada = TRUE ORDER BY es_base DESC, codigo_moneda ASC");
        var idiomas = jdbc.queryForList("SELECT * FROM param_idioma WHERE habilitado = TRUE ORDER BY es_defecto DESC, codigo_idioma ASC");
        var paises = jdbc.queryForList("SELECT * FROM param_pais ORDER BY habilitado DESC, nombre ASC");
        var operadores = jdbc.queryForList("SELECT * FROM param_operador_logistico WHERE activo = TRUE ORDER BY tarifa_base_usd ASC");
        var tasas = jdbc.queryForList("""
            SELECT tc.moneda_destino, tc.tasa, tc.fecha
            FROM tipo_cambio tc
            WHERE tc.id_tipo_cambio IN (
                SELECT MAX(id_tipo_cambio) FROM tipo_cambio WHERE moneda_origen = 'USD' GROUP BY moneda_destino
            )
            ORDER BY tc.moneda_destino
        """);
        return Map.of(
                "monedas", monedas,
                "idiomas", idiomas,
                "paises", paises,
                "operadores", operadores,
                "tasasCambio", tasas
        );
    }

    public record GuardarPaisReq(
            String codigoPais,
            String nombre,
            String monedaLocal,
            String idiomaDefecto,
            BigDecimal tasaIva,
            BigDecimal tarifaZonaUsdKg,
            String categoriasRestringidas,
            boolean habilitado
    ) {}

    @PostMapping("/api/parametros/paises")
    @Transactional
    public ResponseEntity<?> guardarOActualizarPais(@RequestBody GuardarPaisReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if (req.tasaIva() == null || req.tasaIva().compareTo(BigDecimal.ZERO) < 0 || req.tasaIva().compareTo(BigDecimal.ONE) > 0) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "CU13 3a: La tasa de IVA debe estar entre 0.00 y 1.00."));
        }
        String cod = req.codigoPais().trim().toUpperCase();
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM param_pais WHERE codigo_pais = ?", Integer.class, cod);
        if (existe != null && existe > 0) {
            jdbc.update("""
                UPDATE param_pais
                SET nombre = ?, moneda_local = ?, idioma_defecto = ?, tasa_iva = ?,
                    tarifa_zona_usd_kg = ?, categorias_restringidas = ?, habilitado = ?
                WHERE codigo_pais = ?
            """, req.nombre().trim(), req.monedaLocal().toUpperCase(), req.idiomaDefecto().toUpperCase(),
                    req.tasaIva(), req.tarifaZonaUsdKg(),
                    req.categoriasRestringidas() != null ? req.categoriasRestringidas() : "",
                    req.habilitado(), cod);
        } else {
            jdbc.update("""
                INSERT INTO param_pais (codigo_pais, nombre, moneda_local, idioma_defecto, tasa_iva, tarifa_zona_usd_kg, categorias_restringidas, habilitado)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, cod, req.nombre().trim(), req.monedaLocal().toUpperCase(), req.idiomaDefecto().toUpperCase(),
                    req.tasaIva(), req.tarifaZonaUsdKg(),
                    req.categoriasRestringidas() != null ? req.categoriasRestringidas() : "",
                    req.habilitado());
        }

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "CONFIGURACION_PAIS_PARAMETRICO",
                "PARAM_PAIS", null, "EXITOSO", "País " + cod + " actualizado (IVA=" + req.tasaIva() + ", habilitado=" + req.habilitado() + ")");
        return ResponseEntity.ok(Map.of("mensaje", "Parámetro de país '" + cod + "' guardado y auditado sin recompilar (RNF09)."));
    }

    public record GuardarMonedaReq(String codigoMoneda, String nombre, String simbolo, BigDecimal tasaRespectoUsd, boolean habilitada) {}

    @PostMapping("/api/parametros/monedas")
    @Transactional
    public ResponseEntity<?> guardarMonedaYTasa(@RequestBody GuardarMonedaReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if (req.tasaRespectoUsd() == null || req.tasaRespectoUsd().compareTo(BigDecimal.ZERO) <= 0) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "La tasa de cambio debe ser mayor a cero."));
        }
        String cod = req.codigoMoneda().trim().toUpperCase();
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM param_moneda WHERE codigo_moneda = ?", Integer.class, cod);
        if (existe != null && existe > 0) {
            jdbc.update("UPDATE param_moneda SET nombre = ?, simbolo = ?, habilitada = ? WHERE codigo_moneda = ?",
                    req.nombre().trim(), req.simbolo().trim(), req.habilitada(), cod);
        } else {
            jdbc.update("INSERT INTO param_moneda (codigo_moneda, nombre, simbolo, es_base, habilitada) VALUES (?, ?, ?, FALSE, ?)",
                    cod, req.nombre().trim(), req.simbolo().trim(), req.habilitada());
        }
        jdbc.update("INSERT INTO tipo_cambio (moneda_origen, moneda_destino, tasa) VALUES ('USD', ?, ?)",
                cod, req.tasaRespectoUsd());

        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "CONFIGURACION_MONEDA_TASA",
                "PARAM_MONEDA", null, "EXITOSO", "Divisa " + cod + " configurada con tasa " + req.tasaRespectoUsd());
        return ResponseEntity.ok(Map.of("mensaje", "Divisa " + cod + " y su tipo de cambio actualizados."));
    }
}
