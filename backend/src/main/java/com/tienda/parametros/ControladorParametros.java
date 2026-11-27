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
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
        var tasasRaw = jdbc.queryForList("""
            SELECT tc.moneda_destino, tc.tasa, tc.fecha
            FROM tipo_cambio tc
            WHERE tc.id_tipo_cambio IN (
                SELECT MAX(id_tipo_cambio) FROM tipo_cambio WHERE moneda_origen = 'USD' GROUP BY moneda_destino
            )
            ORDER BY tc.moneda_destino
        """);
        List<Map<String, Object>> tasas = new ArrayList<>();
        for (var t : tasasRaw) {
            Map<String, Object> fila = new LinkedHashMap<>(t);
            Object fObj = t.get("fecha");
            boolean vigente = true;
            if (fObj instanceof Timestamp ts) {
                vigente = Duration.between(ts.toInstant(), Instant.now()).toHours() <= 24;
            }
            fila.put("vigente24h", vigente);
            tasas.add(fila);
        }
        return Map.of(
                "monedas", monedas,
                "idiomas", idiomas,
                "paises", paises,
                "operadores", operadores,
                "tasasCambio", tasas
        );
    }

    @GetMapping("/api/parametros/aranceles")
    public List<Map<String, Object>> listarAranceles() {
        return jdbc.queryForList("""
            SELECT a.*, p.nombre AS nombre_pais
            FROM param_arancel a
            JOIN param_pais p ON p.codigo_pais = a.codigo_pais
            ORDER BY a.codigo_pais, a.codigo_arancelario
        """);
    }

    public record GuardarArancelReq(String codigoPais, String codigoArancelario, String descripcionPartida, BigDecimal tasaArancel, boolean restringido) {}

    @PostMapping("/api/parametros/aranceles")
    @Transactional
    public ResponseEntity<?> guardarArancel(@RequestBody GuardarArancelReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if (req.tasaArancel() == null || req.tasaArancel().compareTo(BigDecimal.ZERO) < 0 || req.tasaArancel().compareTo(BigDecimal.ONE) > 0) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "La tasa arancelaria debe estar entre 0.00 y 1.00."));
        }
        String pais = req.codigoPais().trim().toUpperCase();
        String hs = req.codigoArancelario().trim();
        String desc = (req.descripcionPartida() != null && !req.descripcionPartida().isBlank())
                ? req.descripcionPartida().trim()
                : "Partida arancelaria HS " + hs;
        Integer existe = jdbc.queryForObject(
                "SELECT COUNT(*) FROM param_arancel WHERE codigo_pais = ? AND codigo_arancelario = ?",
                Integer.class, pais, hs);
        if (existe != null && existe > 0) {
            jdbc.update("""
                UPDATE param_arancel SET descripcion_partida = ?, tasa_arancel = ?, restringido = ?
                WHERE codigo_pais = ? AND codigo_arancelario = ?
            """, desc, req.tasaArancel(), req.restringido(), pais, hs);
        } else {
            jdbc.update("""
                INSERT INTO param_arancel (codigo_pais, codigo_arancelario, descripcion_partida, tasa_arancel, restringido)
                VALUES (?, ?, ?, ?, ?)
            """, pais, hs, desc, req.tasaArancel(), req.restringido());
        }
        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "CONFIGURACION_ARANCEL_HS",
                "PARAM_ARANCEL", null, "EXITOSO", "Arancel " + pais + "/" + hs + " tasa=" + req.tasaArancel() + " restringido=" + req.restringido());
        return ResponseEntity.ok(Map.of("mensaje", "Partida arancelaria HS " + hs + " para " + pais + " guardada y auditada."));
    }

    public record GuardarOperadorReq(String codigoOperador, String nombre, BigDecimal tarifaBaseUsd, BigDecimal tarifaKgUsd, int diasEstimados, boolean activo) {}

    @PostMapping("/api/parametros/operadores")
    @Transactional
    public ResponseEntity<?> guardarOperadorLogistico(@RequestBody GuardarOperadorReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        if (req.tarifaBaseUsd() == null || req.tarifaBaseUsd().compareTo(BigDecimal.ZERO) <= 0 || req.diasEstimados() <= 0) {
            return ResponseEntity.badRequest().body(Map.of("mensaje", "La tarifa base y los días estimados deben ser mayores a cero."));
        }
        String cod = req.codigoOperador().trim().toUpperCase();
        BigDecimal tarifaKg = (req.tarifaKgUsd() != null && req.tarifaKgUsd().compareTo(BigDecimal.ZERO) > 0)
                ? req.tarifaKgUsd()
                : new BigDecimal("8.50");
        String endpoint = "https://api." + cod.toLowerCase().replace("_", "-") + ".intl/v1/shipments";
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM param_operador_logistico WHERE codigo = ?", Integer.class, cod);
        if (existe != null && existe > 0) {
            jdbc.update("""
                UPDATE param_operador_logistico SET nombre = ?, tarifa_base_usd = ?, tarifa_kg_usd = ?, dias_transito_estimados = ?, activo = ?
                WHERE codigo = ?
            """, req.nombre().trim(), req.tarifaBaseUsd(), tarifaKg, req.diasEstimados(), req.activo(), cod);
        } else {
            jdbc.update("""
                INSERT INTO param_operador_logistico (codigo, nombre, tarifa_base_usd, tarifa_kg_usd, dias_transito_estimados, endpoint_api, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, cod, req.nombre().trim(), req.tarifaBaseUsd(), tarifaKg, req.diasEstimados(), endpoint, req.activo());
        }
        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "CONFIGURACION_OPERADOR_LOGISTICO",
                "PARAM_OPERADOR_LOGISTICO", null, "EXITOSO", "Operador " + cod + " tarifa=" + req.tarifaBaseUsd() + " USD");
        return ResponseEntity.ok(Map.of("mensaje", "Operador logístico '" + cod + "' actualizado sin recompilar (RNF09)."));
    }

    public record GuardarIdiomaReq(String codigoIdioma, String nombre, boolean habilitado) {}

    @PostMapping("/api/parametros/idiomas")
    @Transactional
    public ResponseEntity<?> guardarIdioma(@RequestBody GuardarIdiomaReq req, HttpServletRequest httpReq) {
        var sesion = (ServicioJwtRs256.SesionToken) httpReq.getAttribute(FiltroSeguridadRbac.ATTR_SESION);
        String cod = req.codigoIdioma().trim().toUpperCase();
        Integer existe = jdbc.queryForObject("SELECT COUNT(*) FROM param_idioma WHERE codigo_idioma = ?", Integer.class, cod);
        if (existe != null && existe > 0) {
            jdbc.update("UPDATE param_idioma SET nombre = ?, habilitado = ? WHERE codigo_idioma = ?",
                    req.nombre().trim(), req.habilitado(), cod);
        } else {
            jdbc.update("INSERT INTO param_idioma (codigo_idioma, nombre, es_defecto, habilitado) VALUES (?, ?, FALSE, ?)",
                    cod, req.nombre().trim(), req.habilitado());
        }
        auditoria.registrar(sesion.idSujeto(), sesion.identificador(), "CONFIGURACION_IDIOMA_PORTAL",
                "PARAM_IDIOMA", null, "EXITOSO", "Idioma " + cod + " habilitado=" + req.habilitado());
        return ResponseEntity.ok(Map.of("mensaje", "Idioma '" + cod + "' guardado en parámetros operativos."));
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
