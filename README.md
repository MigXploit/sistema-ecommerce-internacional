# Sistema de Comercio Electrónico Internacional (Prototipo Funcional)
**Universidad Mayor de San Andrés — Carrera de Informática — INF-241 (Paralelo "B") — Grupo 12**

Prototipo funcional construido conforme a la arquitectura, modelo relacional en 3FN (14 tablas + tablas paramétricas), reglas de negocio (`RN01`–`RN20`), segregación estricta de seguridad (`bcrypt` factor 12 + JWT `RS256` + `AUDITORIA` inmutable) y escenarios de validación de `sistema_electronico.pdf`.

---

## 1. Arquitectura Implementada

| Capa / Artefacto | Ubicación | Descripción |
|---|---|---|
| **Base de Datos Relacional (PostgreSQL 18)** | `database/01_schema_3fn.sql`<br>`database/02_triggers_inmutabilidad.sql`<br>`database/03_seed_datos.sql` | Base `db_ecommerce_internacional` en UTF-8 con las 14 relaciones normalizadas en 3FN, tablas paramétricas y triggers de inmutabilidad (`AUDITORIA`, `FACTURA`, `USUARIO`, reembolsos ≤ 100% + evidencia). |
| **Backend API REST & Dominio (Java / Spring Boot)** | `backend/src/main/java/com/tienda/...` | Organizado en los paquetes del **Diagrama D12**: `seguridad` (desacoplado), `catalogo`, `clientes`, `pedidos`, `pagos`, `envios`, `facturacion`, `reportes`, `parametros`, `integraciones`, `dominio` y `persistencia`. |
| **Frontend SPA Multimoneda / Multilenguaje (React + TypeScript)** | `frontend/src/...` | Portal Web Tienda (`ES/EN/PT`, `USD/BRL/BOB/EUR`, compra en 4 pasos), Panel Operativo por rol RBAC y Consola Autónoma del Oficial de Seguridad. |
| **DMZ Perimetral & Lanzadores** | `nginx/nginx.conf`<br>`scripts/` | Reverse Proxy TLS 1.3 + HSTS (Diagrama D11), orquestador por terminal (`scripts/dev-runner.mjs`) y scripts `.bat`/`.ps1` alternativos. |

---

## 2. Ejecución Directa desde la Terminal (Recomendado)

### Opción 1 — Un solo comando en la raíz (levanta Backend + Frontend juntos)
Funciona directamente tanto en **PowerShell** como en **CMD** sin políticas de scripts:

- **Modo Prototipo Autónomo** (carga automáticamente las 14 tablas y datos semilla D13):
  ```bash
  node scripts/dev-runner.mjs
  ```
- **Conectado a PostgreSQL 18 (`db_ecommerce_internacional`)**:
  ```powershell
  # Primero (solo la primera vez) inicializar el esquema en PostgreSQL 18:
  powershell -ExecutionPolicy Bypass -File database/setup_postgres.ps1

  # Luego levantar Backend + Frontend conectados a PostgreSQL:
  node scripts/dev-runner.mjs postgres
  ```
*(Si usas CMD también puedes ejecutar `npm.cmd run dev` o `npm.cmd run dev:postgres`).*

### Opción 2 — Dos terminales separadas (comandos nativos)
- **Terminal 1 (Backend Spring Boot en puerto `8080`)**:
  ```bash
  cd backend
  .\mvnw.cmd -DskipTests package
  java -jar target/ecommerce-internacional.jar --spring.profiles.active=demo
  ```
  *(Quita `--spring.profiles.active=demo` para conectar a PostgreSQL 18 usando variables `DB_USER` y `DB_PASSWORD`).*
- **Terminal 2 (Frontend React/TypeScript en puerto `5173`)**:
  ```bash
  cd frontend
  npm.cmd install
  npm.cmd run dev
  ```
Luego abre en el navegador: **http://localhost:5173**

### Opción 3 — Alternativa por archivos `.bat` / `.ps1`
En la carpeta `scripts/` quedaron guardados los lanzadores alternativos (`iniciar-backend-demo.bat`, `iniciar-backend-postgres.bat`, `iniciar-frontend.bat`).

---

## 3. Usuarios y Credenciales del Prototipo (`bcrypt` factor de costo 12)

### Personal Interno y Módulo Independiente de Seguridad (`USUARIO`)
| Rol RBAC | Login | Contraseña | Módulo Habilitado |
|---|---|---|---|
| `OFICIAL_SEGURIDAD` | `seguridad` | `Seguridad2026!` | **Módulo Independiente de Seguridad** (usuarios, roles, `bcrypt`, `AUDITORIA` inmutable) |
| `ADMINISTRADOR` | `admin.parametros` | `AdminParam2026!` | Parámetros operativos (países, monedas, IVA). **Bloqueado con 403 en Seguridad (`RN20`)** |
| `GESTOR_CATALOGO` | `catalogo` | `Catalogo2026!` | Alta/edición de productos, traducciones `ES/EN/PT`, precios y tasas (`CU01`) |
| `GESTOR_PEDIDOS` | `pedidos` | `Pedidos2026!` | Inspección de productos defectuosos, aislamiento de stock y reembolsos (`CU06`, `CU11`) |
| `LOGISTICA` | `logistica` | `Logistica2026!` | Emisión de guía internacional en 1 clic y tránsito/aduana (`CU07`, `CU08`) |
| `FACTURACION` | `facturacion` | `Factura2026!` | Consulta de Facturas Comerciales inmutables y Notas de Crédito (`CU09`) |
| `GERENTE` | `gerencia` | `Gerencia2026!` | Estadísticas de mayores solicitudes y reportes filtrados por país, tipo de venta e idioma (`CU12`) |
| *(Desactivado `RN18`)* | `ex.operador` | `Inactivo2026!` | Cuenta inactiva para demostrar rechazo de autenticación conservando auditoría |

### Clientes Internacionales (`CLIENTE`)
| Cliente | Correo | Contraseña | Escenario Pre-cargado |
|---|---|---|---|
| **Carla Santos (Brasil)** | `carla.santos@email.br` | `Cliente2026!` | Escenario exacto del **Diagrama de Objetos D13** (`PT`, `BRL`, `1590.00 BRL` = `318.00 USD`, guía `CG-2026-000731`, factura `FAC-BR-2026-0088`) |
| **Sofía García (España)** | `sofia.garcia@importaciones.es` | `Cliente2026!` | Pedido #3 en estado `ENTREGADO` listo para registrar reclamo por `PRODUCTO_DEFECTUOSO` con evidencia (`CU11`) |
| **John Miller (EE.UU.)** | `john.miller@globalcorp.us` | `Cliente2026!` | Pedido #2 `MAYORISTA` en estado `PAGADO` listo en bandeja de Logística para emitir guía en 1 clic (`CU07`) |
| **Diego Rojas (Bolivia)** | `diego.rojas@comercio.bo` | `Cliente2026!` | Cliente en `BOB` / `ES` |
