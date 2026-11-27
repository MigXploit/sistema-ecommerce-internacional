package com.tienda.seguridad;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * API Gateway & Filtro RBAC del Módulo Independiente de Seguridad (Diagrama D10, RNF02, RN20).
 * Garantiza segregación estricta: ADMINISTRADOR no puede acceder a /api/seguridad/**
 * y todo intento cruzado queda asentado en AUDITORIA.
 */
@Configuration(proxyBeanMethods = false)
public class FiltroSeguridadRbac extends OncePerRequestFilter {

    public static final String ATTR_SESION = "SESION_AUTENTICADA";

    private final ServicioJwtRs256 jwtService;
    private final ServicioAuditoria auditoria;
    private final ObjectMapper mapper = new ObjectMapper();

    public FiltroSeguridadRbac(ServicioJwtRs256 jwtService, ServicioAuditoria auditoria) {
        this.jwtService = jwtService;
        this.auditoria = auditoria;
    }

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) {
            chain.doFilter(req, res);
            return;
        }

        String path = req.getRequestURI();
        String method = req.getMethod();

        // Extraer sesión JWT si existe cabecera Authorization: Bearer <token>
        ServicioJwtRs256.SesionToken sesion = null;
        String authHeader = req.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            sesion = jwtService.validarYRenovarActividad(authHeader.substring(7).trim());
            if (sesion != null) {
                req.setAttribute(ATTR_SESION, sesion);
            }
        }

        // Endpoints públicos del Portal Tienda y Autenticación
        if (esRutaPublica(path, method)) {
            chain.doFilter(req, res);
            return;
        }

        if (sesion == null) {
            responderJson(res, 401, "SESION_EXPIRADA_O_NO_AUTENTICADA",
                    "Debe iniciar sesión o su sesión expiró tras 15 minutos de inactividad (RNF01).");
            return;
        }

        // Verificación estricta RBAC por subsistema (RNF02 y Segregación RN20)
        Set<String> rolesPermitidos = rolesRequeridosParaRuta(path, method);
        if (!rolesPermitidos.isEmpty() && !rolesPermitidos.contains(sesion.rol())) {
            Integer idUsr = "INTERNO".equals(sesion.tipoCuenta()) ? sesion.idSujeto() : null;
            auditoria.registrar(
                    idUsr,
                    sesion.identificador(),
                    "ACCESO_CRUZADO_DENEGADO_RBAC",
                    path.startsWith("/api/seguridad") ? "MODULO_SEGURIDAD" : "ENDPOINT_PROTEGIDO",
                    null,
                    "BLOQUEADO_403",
                    "Rol '" + sesion.rol() + "' intentó ejecutar " + method + " " + path + " (RN20 / RNF02)"
            );
            responderJson(res, 403, "ACCESO_DENEGADO_SEGREGACION_RBAC",
                    "Acceso denegado (RN20/RNF02): el rol " + sesion.rol()
                            + " no tiene privilegios sobre este módulo. El intento ha sido registrado en AUDITORIA.");
            return;
        }

        chain.doFilter(req, res);
    }

    private boolean esRutaPublica(String path, String method) {
        if (!path.startsWith("/api/")) return true;
        if (path.startsWith("/api/auth/")) return true;
        if (path.equals("/api/salud")) return true;
        if ("GET".equalsIgnoreCase(method) && (
                path.startsWith("/api/catalogo") ||
                path.startsWith("/api/parametros/publicos")
        )) {
            return true;
        }
        return false;
    }

    private Set<String> rolesRequeridosParaRuta(String path, String method) {
        // RN20 / CU14: Exclusivo para el Oficial de Seguridad (ADMINISTRADOR estrictamente excluido)
        if (path.startsWith("/api/seguridad")) {
            return Set.of("OFICIAL_SEGURIDAD");
        }
        // CU13 / RF22: Exclusivo para Administrador de Parámetros Operativos
        if (path.startsWith("/api/parametros")) {
            return Set.of("ADMINISTRADOR");
        }
        // CU01: Gestión de catálogo y precios
        if (path.startsWith("/api/catalogo")) {
            return Set.of("GESTOR_CATALOGO");
        }
        // CU12: Reportes multidimensionales y estadísticas gerenciales
        if (path.startsWith("/api/reportes")) {
            return Set.of("GERENTE");
        }
        // CU07: Emisión de guías y despacho logístico
        if (path.startsWith("/api/envios/gestion")) {
            return Set.of("LOGISTICA");
        }
        // CU08: Seguimiento logístico autenticado (solo Cliente dueño, Logística o Gestor de Pedidos)
        if (path.startsWith("/api/envios/seguimiento")) {
            return Set.of("CLIENTE", "LOGISTICA", "GESTOR_PEDIDOS");
        }
        // CU09: Gestión tributaria de facturas y notas de crédito
        if (path.startsWith("/api/facturacion/gestion")) {
            return Set.of("FACTURACION", "GERENTE");
        }
        // CU06 / CU11: Evaluación de devoluciones por defectos y control de reembolsos
        if (path.startsWith("/api/postventa/gestion")) {
            return Set.of("GESTOR_PEDIDOS");
        }
        // RF05 / RF06 / CU10: Perfil, direcciones y notificaciones privadas exclusivas de CLIENTE
        if (path.startsWith("/api/clientes/")) {
            return Set.of("CLIENTE");
        }
        // Endpoints autenticados generales (pedidos/pagos validan titularidad y rol en controlador)
        return Set.of();
    }

    private void responderJson(HttpServletResponse res, int status, String codigo, String mensaje) throws IOException {
        res.setStatus(status);
        res.setCharacterEncoding("UTF-8");
        res.setContentType("application/json");
        mapper.writeValue(res.getWriter(), Map.of(
                "error", codigo,
                "mensaje", mensaje,
                "status", status
        ));
    }
}
