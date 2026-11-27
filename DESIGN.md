# DESIGN.md — Sistema de Comercio Electrónico Internacional (Grupo 12)

## 1. Propósito y Contexto del Sistema
Plataforma web SPA (React + TypeScript) con soporte **Multilenguaje (`ES`, `EN`, `PT`)** y **Multimoneda (`USD`, `BRL`, `BOB`, `EUR`)**, dividida en tres experiencias con identidad visual diferenciada:
1. **Portal Web Tienda (B2C / B2B):** Catálogo internacional, carrito y compra en máximo 4 pasos (`RNF12`).
2. **Panel Operativo por Rol (RBAC):** Gestión de Catálogo, Pedidos/Devoluciones, Logística, Facturación, Administración de Parámetros y Reportes Gerenciales.
3. **Consola Autónoma del Oficial de Seguridad (`RN20`):** Gestión independiente de usuarios, roles, políticas `bcrypt` y visor de `AUDITORIA` inmutable.

---

## 2. Sistema de Tokens Visuales

### Paleta de Colores (WCAG AA)
- **Marca / Primario (Tienda y Acciones Principales):** `#0F4C81` (Azul Océano Profundo) | Hover: `#0A355C`
- **Acento Comercial (CTAs de Compra / Conversión):** `#059669` (Verde Esmeralda) | Hover: `#047857`
- **Superficies y Fondos:**
  - Fondo General: `#F8FAFC`
  - Tarjetas / Contenedores: `#FFFFFF` con borde `#E2E8F0`
  - Consola de Seguridad (`OFICIAL_SEGURIDAD`): Encabezado `#0F172A` (Pizarra Oscuro) con acento `#D97706` (Ámbar de Auditoría)
- **Texto:**
  - Principal: `#0F172A`
  - Secundario / Etiquetas: `#475569`
- **Estados Semánticos (Pedidos, Envíos y Pagos):**
  - `APROBADO` / `ENTREGADO` / `EMITIDA`: Fondo `#DCFCE7`, Texto `#166534`
  - `PENDIENTE` / `CREADO` / `EN_TRANSITO` / `EN_ADUANA`: Fondo `#FEF3C7`, Texto `#92400E`
  - `RECHAZADO` / `CANCELADO` / `DEVUELTO` / `PRODUCTO_DEFECTUOSO`: Fondo `#FEE2E2`, Texto `#991B1B`

### Tipografía y Escala
- **Fuente UI / Títulos:** `'Inter', system-ui, -apple-system, sans-serif`
- **Fuente Numérica / Precios / Guías / Facturas:** `'JetBrains Mono', monospace` con `font-variant-numeric: tabular-nums` (para alinear monedas, tasas de cambio y códigos `SKU` / guías `CG-...` / facturas `FAC-...`).
- **Escala:** `12px` (badges/tablas), `14px` (cuerpo operativo), `16px` (cuerpo tienda), `20px` (subtítulos), `28px` (títulos de vista).

### Espaciado, Bordes y Elevación
- **Unidad base:** `4px` (escala: `8px`, `12px`, `16px`, `24px`, `32px`).
- **Radio de borde:** `8px` en botones e inputs; `12px` en tarjetas de producto y modales.
- **Sombras:** Sutiles (`0 1px 3px rgba(15, 23, 42, 0.08)`), evitando sombras pesadas.

---

## 3. Reglas de Diseño por Módulo

### A. Header Estilo Marketplace (3 Niveles Limpios)
1. **Top Bar fina (`#0F172A`, `32px` de alto):** Indicador de tasa de cambio vigente (`1 USD = ...`, `RN02/RN03`), aviso de transparencia arancelaria (`RN07`), selector de Idioma (`ES | EN | PT`) y Moneda (`USD | BRL | BOB | EUR`).
2. **Header Principal (`#FFFFFF`, borde inferior `#E2E8F0`, *sticky*):** Logo `AndesGlobal Trade` a la izquierda, barra de búsqueda central redondeada con selector de categoría integrado y botón de lupa `#0F4C81`, y a la derecha acciones limpias de **Cuenta / Pedidos**, **Rastrear Envío (`CU08`)** y **Carrito con contador animado**.
3. **Barra de Categorías horizontal rápida** debajo del header para filtrado en 1 clic sin recargar la página ni perder el carrito (`CU03`).
- En modo **Consola Autónoma de Seguridad (`OFICIAL_SEGURIDAD`)**, el header mantiene identidad pizarra oscuro `#0F172A` con acento ámbar `#D97706`.

### B. Portada Hero y Catálogo en 4 Columnas (`CU01`, `CU03`)
- **Banner Hero compacto:** Encabezado comercial moderno con degradado `#0F4C81 → #1E3A8A`, llamada a la acción y 3 tarjetas de beneficios (*Envío global*, *Impuestos claros RN07*, *Devolución garantizada RN19*).
- **Grilla de 4 columnas en escritorio:** Catálogo limpio a ancho completo (sin panel lateral fijo) con tarjetas `ProductCard` en proporción `4:3`, estado de carga *skeleton*, micro-animación `translateY(-4px)` al pasar el cursor, precio en `JetBrains Mono`, stock vendible real (`RN01`) y botón verde `#059669`.
- **Filtros:** Búsqueda central + barra de categorías + filtro de rango de precio (`mín / máx`) en la moneda activa.

### C. Checkout en 4 Pasos dentro de Drawer Deslizable (`RNF12` y `RN07`)
- El componente `CheckoutStepper` se presenta como un **Drawer lateral deslizable** desde la derecha (con *backdrop* difuminado y transición `cubic-bezier(0.16, 1, 0.3, 1)`), que se abre al pulsar el ícono del carrito en el header o al añadir un producto.
1. **Paso 1 — Carrito:** Edición rápida de cantidades (`- / +`), validación de stock máximo (`RN06`) y detección automática de tipo de venta (`MINORISTA`, `MAYORISTA`, `PROMOCIONAL`).
2. **Paso 2 — Dirección Internacional:** Formulario adaptado al país destino (código postal, datos fiscales) y validación de países/productos restringidos (`RN12`).
3. **Paso 3 — Cotización y Desglose Obligatorio (`RN07`):** Muestra obligatoriamente:
   - Subtotal de productos
   - Impuestos / Aranceles estimados por país y código HS
   - Costo de envío (indicando peso tasable físico/volumétrico)
   - **Total Congelado** en la moneda del cliente (`RN02`)
4. **Paso 4 — Pago Seguro (`RN11`):** Interfaz limpia con insignia PCI DSS, selector de método de pago y confirmación inmediata con acceso a factura y seguimiento.

### D. Postventa, Seguimiento y Devoluciones (`CU08`, `CU11`)
- **Seguimiento de Envío:** Vista dedicada *Rastrear Envío* (`GET /api/envios/seguimiento/{codigo}`) y línea de tiempo visual horizontal/vertical con estados: `PENDIENTE` → `EN_TRANSITO` → `EN_ADUANA` → `ENTREGADO` (o `DEVUELTO`) mostrando número de guía y operador.
- **Devolución por Producto Defectuoso (`RN19`):** Modal guiado que exige seleccionar ítems, causal (`PRODUCTO_DEFECTUOSO`), descripción y carga obligatoria de evidencia fotográfica antes de habilitar el envío del reclamo.

### E. Paneles Operativos y Consola de Seguridad (`RBAC`)
- **Layout Administrativo:** Barra lateral izquierda fija con navegación estricta según el rol autenticado (`GESTOR_CATALOGO`, `GESTOR_PEDIDOS`, `LOGISTICA`, `FACTURACION`, `ADMINISTRADOR`, `GERENTE`), colapsable en horizontal en `< 768px` (`RNF13`).
- **Tablas Operativas:** Encabezados fijos, filtros combinables en la parte superior (Reportes `CU12`: País, Tipo de Venta, Idioma, Moneda, Fechas), paginación clara y acciones rápidas en 1 clic (`CU07`).
- **Inmutabilidad Visual (`RN16`, `RN17`):** En Facturas emitidas y registros de Auditoría, mostrar etiqueta `🔒 INMUTABLE / SOLO LECTURA` y ocultar botones de edición o borrado en filas.

### F. Pantalla Dedicada de Autenticación Dividida (`AuthPage.tsx`)
- Elimina la barra permanente de actores en la portada pública y presenta una vista limpia dividida en **2 columnas (50% / 50%)**:
  - **Izquierda (Marca y Confianza):** Degradado `#0F4C81 → #1E3A8A`, insignias de confianza (`PCI DSS`, `Cálculo Aduanero RN07`, `Multimoneda 24h`) y tarjeta estilizada de operación internacional.
  - **Derecha (Formulario y Demo):** Selector tipo píldora (`Cliente Internacional | Personal Interno / Seguridad`), pestañas `Iniciar Sesión` / `Crear Cuenta` (`CU02`), y acordeón colapsable *«Acceso Rápido de Demostración (INF-241)»* para los 4 clientes y 7 roles internos.

### G. Micro-animaciones y Transiciones Fluidas
- Curva estándar: `cubic-bezier(0.16, 1, 0.3, 1)` aplicada a elevación de tarjetas (`translateY(-4px)`), apertura del Drawer de Checkout, transición de vistas/pestañas, contador animado del carrito y *skeletons* de carga.

---

## 4. Restricciones e Invariantes de UI (No Hacer)
- **NO** mezclar controles de seguridad (contraseñas, roles, auditoría) dentro del panel del `ADMINISTRADOR` (`RN20`).
- **NO** permitir avanzar al pago sin mostrar el desglose completo de impuestos y envío (`RN07`).
- **NO** renderizar campos de número completo de tarjeta o CVV almacenados en historial (`RN11`).
- **NO** dejar textos sin traducir al cambiar entre `ES`, `EN` y `PT` (`RNF07`).

## 5. Sistema de Retroalimentación y Alertas (SweetAlert2 + Toasts)

### Estrategia Dual según Criticidad
1. **Notificaciones Toast (Confirmaciones rápidas, 3.5s auto-cierre):**
   - Ubicación: Esquina superior derecha (`top-end`), debajo del `HeaderGlobal`.
   - Uso: Añadir/editar ítems en carrito (`CU03`), cambio de moneda/idioma, filtros aplicados o guardado rápido de catálogo (`CU01`).
2. **Modales SweetAlert2 (Decisiones críticas, bloqueos de negocio y auditoría):**
   - **Confirmación de Pago / Congelamiento (`RN02`, `RN07`):** Muestra el monto total congelado en `JetBrains Mono` antes de ejecutar el cobro con token (`CU05`).
   - **Aprobación de Reembolso / Cuarentena (`RN10`, `RN19`):** Exige confirmación explícita del Gestor de Pedidos indicando monto máximo reembolsable, aislamiento de stock defectuoso y emisión automática de Nota de Crédito (`CU06`, `CU11`).
   - **Bloqueos de Seguridad e Inmutabilidad (`RN16`, `RN17`, `RN20`):** Modal con acento `#0F172A` / `#D97706` cuando se rechaza un intento de alteración en Facturas o Auditoría (`403 Forbidden`), explicando la regla violada.
   - **Errores de Validación / Aduana (`RN06`, `RN12`, `RN14`):** Modal claro en el idioma activo (`ES`, `EN`, `PT`) cuando falta stock, un país está restringido o falta código arancelario HS.

### Estilizado Nativo (Tokens DESIGN.md)
- Fondo modal: `#FFFFFF`, borde `1px solid #E2E8F0`, radio `12px`, fuente `'Inter'`.
- Botón Confirmar: `#0F4C81` (o `#059669` en acciones de compra), radio `8px`.
- Botón Cancelar / Peligro: `#DC2626` o `#475569`, radio `8px`.
- Códigos de referencia (`FAC-...`, `CG-...`, `RN...`) renderizados en `'JetBrains Mono'`.

