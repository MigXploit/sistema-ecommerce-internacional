package com.tienda.persistencia;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;

/**
 * Capa de Persistencia: verifica la conexión JDBC/HikariCP y garantiza que el esquema 3FN
 * y los datos semilla del prototipo estén listos tanto en PostgreSQL 18 como en perfil demo.
 */
@Component
@Order(1)
public class InicializadorBaseDatos implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(InicializadorBaseDatos.class);

    private final JdbcTemplate jdbc;
    private final DataSource dataSource;

    @Value("${app.auto-seed-if-empty:true}")
    private boolean autoSeed;

    public InicializadorBaseDatos(JdbcTemplate jdbc, DataSource dataSource) {
        this.jdbc = jdbc;
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) throws Exception {
        String dbProduct;
        try (Connection conn = dataSource.getConnection()) {
            dbProduct = conn.getMetaData().getDatabaseProductName();
            log.info("Conectado a motor relacional transaccional: {} ({})", dbProduct, conn.getMetaData().getURL());
        }

        boolean tablaExiste = existeTablaUsuario();
        if (!tablaExiste && autoSeed) {
            log.info("Inicializando esquema 3FN (14 tablas + paramétricas) y datos semilla del prototipo...");
            boolean esPostgres = dbProduct != null && dbProduct.toLowerCase().contains("postgres");
            ejecutarScriptSql(resolverRutaSql("01_schema_3fn.sql"), esPostgres);
            if (esPostgres) {
                ejecutarTriggersPostgres(resolverRutaSql("02_triggers_inmutabilidad.sql"));
            }
            ejecutarSeedCompatible(resolverRutaSql("03_seed_datos.sql"), esPostgres);
            log.info("Base de datos inicializada exitosamente con usuarios RBAC, catálogo multimoneda y pedidos D13.");
        } else {
            Integer countUsuarios = jdbc.queryForObject("SELECT COUNT(*) FROM usuario", Integer.class);
            log.info("Esquema verificado: {} cuentas internas registradas en módulo de Seguridad.", countUsuarios);
        }
    }

    private boolean existeTablaUsuario() {
        try {
            jdbc.queryForObject("SELECT COUNT(*) FROM usuario", Integer.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Path resolverRutaSql(String nombreArchivo) {
        Path p1 = Path.of("..", "database", nombreArchivo);
        if (Files.exists(p1)) return p1;
        Path p2 = Path.of("database", nombreArchivo);
        if (Files.exists(p2)) return p2;
        throw new IllegalStateException("No se encontró el archivo SQL: " + nombreArchivo);
    }

    private void ejecutarScriptSql(Path ruta, boolean esPostgres) throws Exception {
        String contenido = Files.readString(ruta, StandardCharsets.UTF_8);
        StringBuilder sentenciaActual = new StringBuilder();
        boolean omitiendoIndiceParcial = false;
        for (String linea : contenido.split("\\R")) {
            String limpia = linea.trim();
            if (limpia.isEmpty() || limpia.startsWith("--")) continue;
            if (!esPostgres && limpia.toUpperCase().startsWith("SET CLIENT_ENCODING")) continue;
            // En H2 el índice único parcial con WHERE se omite y se valida transaccionalmente en ServicioFacturacion
            if (!esPostgres && limpia.toUpperCase().startsWith("CREATE UNIQUE INDEX UQ_FACTURA_COMERCIAL_POR_PEDIDO")) {
                omitiendoIndiceParcial = true;
            }
            if (omitiendoIndiceParcial) {
                if (limpia.endsWith(";")) {
                    omitiendoIndiceParcial = false;
                }
                continue;
            }
            sentenciaActual.append(linea).append("\n");
            if (limpia.endsWith(";")) {
                String sql = sentenciaActual.toString().trim();
                sql = sql.substring(0, sql.length() - 1);
                if (!sql.isBlank()) {
                    jdbc.execute(sql);
                }
                sentenciaActual.setLength(0);
            }
        }
        if (!esPostgres) {
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS notificacion_cliente (
                    id_notificacion SERIAL PRIMARY KEY,
                    id_cliente INT NOT NULL REFERENCES cliente(id_cliente),
                    id_pedido INT REFERENCES pedido(id_pedido),
                    idioma VARCHAR(5) NOT NULL REFERENCES param_idioma(codigo_idioma),
                    evento VARCHAR(60) NOT NULL,
                    destinatario_correo VARCHAR(180) NOT NULL,
                    asunto VARCHAR(220) NOT NULL,
                    cuerpo TEXT NOT NULL,
                    estado_envio VARCHAR(30) NOT NULL DEFAULT 'ENVIADO',
                    fecha_envio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """);
            jdbc.execute("""
                CREATE TABLE IF NOT EXISTS registro_demanda (
                    id_demanda SERIAL PRIMARY KEY,
                    id_producto INT REFERENCES producto(id_producto) ON DELETE SET NULL,
                    tipo_solicitud VARCHAR(40) NOT NULL,
                    termino_referencia VARCHAR(200),
                    pais VARCHAR(5),
                    idioma VARCHAR(5),
                    moneda VARCHAR(10),
                    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """);
        }
    }

    private void ejecutarTriggersPostgres(Path ruta) throws Exception {
        String sqlCompleto = Files.readString(ruta, StandardCharsets.UTF_8);
        jdbc.execute(sqlCompleto);
    }

    private void ejecutarSeedCompatible(Path ruta, boolean esPostgres) throws Exception {
        String contenido = Files.readString(ruta, StandardCharsets.UTF_8);
        if (!esPostgres) {
            contenido = contenido
                .replace("CURRENT_TIMESTAMP - INTERVAL '4 days'", "DATEADD('DAY', -4, CURRENT_TIMESTAMP)")
                .replace("CURRENT_TIMESTAMP - INTERVAL '1 day'", "DATEADD('DAY', -1, CURRENT_TIMESTAMP)")
                .replace("CURRENT_TIMESTAMP - INTERVAL '9 days'", "DATEADD('DAY', -9, CURRENT_TIMESTAMP)")
                .replace("CURRENT_TIMESTAMP - INTERVAL '14 days'", "DATEADD('DAY', -14, CURRENT_TIMESTAMP)")
                .replace("CURRENT_TIMESTAMP - INTERVAL '6 days'", "DATEADD('DAY', -6, CURRENT_TIMESTAMP)")
                .replace("CURRENT_DATE + 3", "DATEADD('DAY', 3, CURRENT_DATE)")
                .replace("CURRENT_DATE - 3", "DATEADD('DAY', -3, CURRENT_DATE)")
                .replace("CURRENT_DATE - 8", "DATEADD('DAY', -8, CURRENT_DATE)");
        }
        StringBuilder sb = new StringBuilder();
        for (String linea : contenido.split("\\R")) {
            String limpia = linea.trim();
            if (limpia.isEmpty() || limpia.startsWith("--")) continue;
            if (!esPostgres && limpia.toUpperCase().startsWith("SET CLIENT_ENCODING")) continue;
            sb.append(linea).append("\n");
            if (limpia.endsWith(";")) {
                String sql = sb.toString().trim();
                sql = sql.substring(0, sql.length() - 1);
                if (!sql.isBlank()) {
                    jdbc.execute(sql);
                }
                sb.setLength(0);
            }
        }
    }
}
