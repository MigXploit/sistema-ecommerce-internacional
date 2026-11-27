# Flujo Integral del Sistema de Comercio Electrónico Internacional
**Universidad Mayor de San Andrés — Carrera de Informática — INF-241 (Paralelo "B") — Grupo 12**

Este documento describe de extremo a extremo el flujo operativo, transaccional y de seguridad del sistema, desde que un cliente internacional ingresa a la tienda hasta el despacho aduanero, la facturación, la postventa por productos defectuosos, los reportes gerenciales y la auditoría inmutable.

---

## Resumen Visual del Ciclo de Vida (7 Fases)

```
[Fase 1: Catálogo Multimoneda/Multilenguaje] (Cliente / Gestor de Catálogo)
       │
       ▼
[Fase 2: Carrito, Cotización Aduanera y Pedido CREADO] (4 Pasos - Congelamiento RN02/RN07)
       │
       ▼
[Fase 3: Pago Internacional Tokenizado PCI DSS] (Estado PAGADO + Equivalente Base USD RN09)
       │
       ├──────────────────────────────────────────────────────────┐
       ▼                                                          ▼
[Fase 4: Emisión Automática de Factura Comercial Inmutable]  [Fase 5: Logística, Guía Internacional y Aduana]
 (FAC-PAIS-2026-NNNN • Solo Lectura RN15/RN16)                (PENDIENTE → EN_TRANSITO ↔ EN_ADUANA → ENTREGADO)
                                                                  │
                                                                  ▼
                                                     [Fase 6: Postventa y Control de Defectos]
                                                      (Evidencia RN19 → Cuarentena Stock → Reembolso ≤ 100% + Nota de Crédito)
                                                                  │
                                                                  ▼
                                                     [Fase 7: Reportes Multidimensionales y Auditoría Inmutable]
                                                      (Gerencia CU12 + Oficial de Seguridad Autónomo CU14 / RN20)
```

---

## Fase 1: Localización, Catálogo y Conversión Multimoneda (`CU01`, `RF01`–`RF04`, `RF12`)

1. **Publicación en Catálogo (`GESTOR_CATALOGO`):**
   - El Gestor de Catálogo registra cada producto en la tabla `PRODUCTO` con su código `SKU` único, categoría, peso físico en kg (`peso_kg`), dimensiones en cm (`Largo x Ancho x Alto`), partida arancelaria (`codigo_arancelario` HS), stock vendible (`stock`) y precio base en dólares (`precio_base_usd`).
   - Se registran las traducciones en `TRADUCCION_PRODUCTO` (`ES`, `EN`, `PT`) y el sistema calcula los precios en `PRECIO_PRODUCTO` para cada divisa (`USD`, `BRL`, `BOB`, `EUR`) multiplicando el precio base por la tasa vigente en `TIPO_CAMBIO` (`RN01`, `RN02`).
   - Si un producto no tiene stock o carece de traducción en el idioma base, no se expone en la tienda (`RN01`).
2. **Navegación del Cliente Internacional (`CLIENTE`):**
   - El cliente ingresa al **Portal Tienda** y elige en la esquina superior derecha su **Idioma (`ES | EN | PT`)** y su **Moneda (`USD | BRL | BOB | EUR`)**.
   - Toda la interfaz, nombres de productos y precios se actualizan en tiempo real sin recargar la página ni perder el carrito.
   - Cada búsqueda o consulta de producto se asienta automáticamente en `REGISTRO_DEMANDA` para alimentar las estadísticas gerenciales de mayores solicitudes (`RF04`, `RF24`).

---

## Fase 2: Carrito, Cotización Aduanera y Confirmación del Pedido (`CU02`–`CU04`, `RN02`, `RN06`, `RN07`, `RN12`)

El flujo de compra se completa en **máximo 4 pasos** (`RNF12`) dentro del `CheckoutStepper`:

1. **Paso 1 — Carrito y Clasificación de Venta (`CU03`):**
   - El cliente añade productos y ajusta cantidades (`- / +`).
   - **Validación de Stock (`RN06`):** El sistema impide superar el `stock` vendible disponible.
   - **Detección de Tipo de Venta (`RF08`):** El sistema clasifica la orden como `MINORISTA` (< 10 unidades), `MAYORISTA` (automático al alcanzar ≥ 10 unidades) o `PROMOCIONAL`.
2. **Paso 2 — Dirección Internacional y Validación Aduanera (`CU02`, `RN12`):**
   - El cliente selecciona o registra su dirección postal en `DIRECCION` (validando el formato de código postal según la expresión regular de `PARAM_PAIS`).
   - **Control Aduanero (`RN12`):** Si el país de destino no está habilitado (ej. `XX`) o si alguno de los productos pertenece a una categoría/partida HS restringida en ese país, el sistema bloquea el avance y muestra un modal explicando la restricción.
3. **Paso 3 — Cotización Logística, Cálculo Fiscal y Congelamiento (`CU04`, `RN02`, `RN07`):**
   - **Peso Tasable (Fórmula 7.5.5 #2):** Para cada ítem, el sistema compara el peso físico contra el peso volumétrico:
     $$\text{Peso Volumétrico (kg)} = \frac{\text{Largo} \times \text{Ancho} \times \text{Alto}}{5000}$$
     y aplica como **Peso Tasable** el mayor entre la suma física y la suma volumétrica.
   - **Impuestos y Aranceles (Fórmula 7.5.5 #3):** Calcula el arancel de importación según país y código arancelario (`PARAM_ARANCEL`) más el impuesto local (`tasa_iva` en `PARAM_PAIS`).
   - **Desglose Obligatorio (`RN07`) y Congelamiento (`RN02`):** Antes de pagar, el cliente visualiza en el resumen lateral fijo (*sticky*):
     - Subtotal de productos
     - Impuestos y aranceles estimados
     - Costo de envío internacional
     - **Total Congelado** en su moneda y su equivalencia en `USD`
   - Al pulsar **«Confirmar Pedido»**, se inserta el registro en `PEDIDO` (y sus líneas en `DETALLE_PEDIDO`) con estado inicial **`CREADO`** y la `tasa_aplicada` congelada para proteger la operación de fluctuaciones cambiarias posteriores.

---

## Fase 3: Pago Internacional Tokenizado PCI DSS (`CU05`, `RF11`, `RNF03`, `RNF04`, `RN08`, `RN09`, `RN11`)

1. **Paso 4 — Autorización con Token (`RN11`):**
   - El cliente elige el medio de pago (`TARJETA`, `TRANSFERENCIA` o `BILLETERA_DIGITAL`) y confirma el monto congelado en el modal de verificación.
   - **Cumplimiento PCI DSS (`RNF03`, `RN11`):** El sistema jamás solicita ni almacena números completos de tarjeta (`PAN`) ni códigos `CVV`; envía únicamente un `token_transaccional` y una clave de idempotencia al adaptador de la Pasarela de Pagos.
2. **Transacción Atómica ACID (`RNF04`):**
   - **Si la pasarela rechaza el cobro (`Excepción CU05 4a`):** Se registra el intento en `PAGO` con estado `RECHAZADO`, el pedido permanece en estado **`CREADO`** sin descontar stock y el cliente puede reintentar con otro medio.
   - **Si la pasarela aprueba el cobro (`APROBADO`):** En una única transacción atómica (`@Transactional`):
     1. Se registra el `PAGO` guardando el monto en la moneda cobrada, su **`equivalente_base` en USD** (`RN09`) y la `referencia_pasarela` única (`PG-REF-...`).
     2. Se descuenta en firme el `stock` vendible en `PRODUCTO`.
     3. El `PEDIDO` avanza de `CREADO` a **`PAGADO`** (`RN05`, `RN08`).
     4. Se dispara automáticamente la emisión de la **Factura Comercial** (`CU09`) y la notificación en el idioma del cliente (`CU10`).
     5. Se asienta el registro inmutable en `AUDITORIA` (`RN17`).

---

## Fase 4: Facturación Comercial Inmutable (`CU09`, `RF16`, `RN15`, `RN16`)

1. **Emisión Correlativa Automática (`RN15`):**
   - Al aprobarse el pago, el módulo `com.tienda.facturacion` genera una única factura comercial por pedido en la tabla `FACTURA` con numeración correlativa por país (`FAC-{PAIS}-2026-{NNNN}`), los datos fiscales del cliente y el desglose tributario en estado **`EMITIDA`**.
2. **Inmutabilidad Documental (`RN16`):**
   - Toda factura emitida se marca en la interfaz con el sello **`🔒 INMUTABLE / SOLO LECTURA`**.
   - Ni el Responsable de Facturación ni ningún otro rol puede editar o eliminar físicamente una factura (protegido tanto en el backend como por el trigger `trg_factura_inmutable` en PostgreSQL). Cualquier ajuste posterior por devolución se realiza exclusivamente emitiendo una **Nota de Crédito vinculada** (`NC-{PAIS}-2026-{NNNN}`).

---

## Fase 5: Despacho Logístico, Guía Internacional y Paso por Aduana (`CU07`, `CU08`, `RN08`, `RN13`, `RN14`, Diagrama `D09`)

1. **Bandeja de Despacho y Emisión de Guía en 1 Clic (`LOGISTICA` — `CU07`):**
   - El pedido en estado **`PAGADO`** aparece automáticamente en la bandeja del Responsable de Logística (`RN08`).
   - Al pulsar **«Emitir Guía Internacional»**:
     - El sistema verifica que todos los productos del pedido tengan `peso_kg > 0`, `dimensiones` y `codigo_arancelario` HS (`RN14`).
     - Conecta con el Operador Logístico (`Courier Global` / `DHL Express`), genera el número de guía único (`CG-2026-...` / `DHL-2026-...`) y la etiqueta de exportación (`RN13`).
     - Crea el registro en `ENVIO` con estado **`EN_TRANSITO`**, actualiza el `PEDIDO` a **`ENVIADO`** y notifica al cliente en su idioma (`CU10`).
2. **Seguimiento Internacional y Aduana (`CU08` / Máquina de Estados `D09`):**
   - A medida que el paquete avanza, Logística (o el webhook del operador) actualiza los hitos:
     - `PENDIENTE` → **`EN_TRANSITO`** (salida internacional).
     - `EN_TRANSITO` → **`EN_ADUANA`** (revisión documental/arancelaria en el país de destino).
     - `EN_ADUANA` → **`EN_TRANSITO`** (liberado por aduana) o **`DEVUELTO`** (si la importación es rechazada).
     - `EN_TRANSITO` → **`ENTREGADO`** (recepción final confirmada; el `PEDIDO` pasa también a **`ENTREGADO`**).
   - El cliente visualiza toda la línea de tiempo actualizada en vivo desde la pestaña **«Mis Pedidos y Envíos»**.

---

## Fase 6: Postventa, Devolución por Producto Defectuoso, Cuarentena y Reembolso (`CU11`, `CU06`, `RF13`, `RF17`, `RF19`, `RN10`, `RN19`)

1. **Registro del Reclamo por el Cliente (`CU11`):**
   - Sobre un pedido en estado **`ENTREGADO`**, el cliente pulsa **«Reportar Producto Defectuoso / Devolución»**.
   - Selecciona el ítem afectado, la cantidad, la causal tipificada (`PRODUCTO_DEFECTUOSO`, `DANO_TRANSPORTE` o `ERROR_ENVIO`), describe la falla y adjunta la referencia de evidencia fotográfica o informe técnico (`evidencia_ref`).
   - **Regla `RN19`:** Si la causal es `PRODUCTO_DEFECTUOSO` y falta la evidencia, tanto el modal guiado como el backend y el trigger de base de datos bloquean el registro.
   - La solicitud queda registrada en `REEMBOLSO` con estado **`PENDIENTE`** y aparece de inmediato en el resumen del pedido del cliente y en la bandeja del `GESTOR_PEDIDOS`.
2. **Inspección de Calidad, Aislamiento de Stock y Reembolso Controlado (`GESTOR_PEDIDOS` — `CU06`):**
   - El Gestor de Pedidos revisa la evidencia en su panel y pulsa **«Aprobar, Aislar y Reembolsar»**.
   - Tras confirmar en el modal de seguridad, el sistema ejecuta atómicamente:
     1. **Control de Tope (`RN10`):** Verifica que la suma de reembolsos del pago no supere el **100%** del monto originalmente cobrado ($\sum \text{Reembolso} \le \text{Pago.monto}$).
     2. **Cuarentena de Stock Defectuoso (`RN19`):** Incrementa la columna `stock_defectuoso` del producto afectado sin devolver jamás las unidades dañadas al `stock` vendible (evitando la reventa de mercadería mala).
     3. **Reversión en Pasarela (`CU06`):** Procesa la devolución monetaria ante la pasarela de pagos, marca el `REEMBOLSO` como **`APROBADO`**, el `PAGO` como **`REEMBOLSADO`** y el `PEDIDO` como **`DEVUELTO`**.
     4. **Emisión Automática de Nota de Crédito (`RN16`, `RF17`):** Emite en `FACTURA` un documento de tipo **`NOTA_CREDITO`** (`NC-{PAIS}-2026-{NNNN}`) vinculado mediante `id_factura_origen` a la factura comercial original (la cual permanece intacta).
     5. **Notificación y Auditoría (`CU10`, `RN17`):** Envía el aviso al cliente en su idioma y registra la operación en `AUDITORIA`.

---

## Fase 7: Analítica Gerencial, Parámetros Operativos y Seguridad Independiente (`CU12`, `CU13`, `CU14`, `RN17`, `RN18`, `RN20`)

1. **Estadísticas de Demanda y Reportes Multidimensionales (`GERENTE` — `CU12`, `RF20`, `RF24`):**
   - El Gerente consulta en tiempo real:
     - **KPIs Consolidados:** Volumen total de ingresos convertidos a moneda base (`USD`), total de pedidos operados y tasa porcentual de devoluciones por productos defectuosos.
     - **Demanda de Clientes (`RF24`):** Ranking de los productos más solicitados/vendidos y listado de las mayores búsquedas y requerimientos registrados en `REGISTRO_DEMANDA`.
     - **Reporte Multidimensional Controlado (`RF20`):** Cruce combinable por **País de destino**, **Tipo de venta (`MINORISTA`, `MAYORISTA`, `PROMOCIONAL`)**, **Idioma de operación (`ES`, `EN`, `PT`)**, **Moneda** y **Rango de fechas**, totalizando cada fila en su divisa original y en `USD`.
2. **Parámetros Operativos sin Recompilar (`ADMINISTRADOR` — `CU13`, `RF22`, `RNF09`):**
   - El Administrador del Sistema da de alta o actualiza países (`PARAM_PAIS`), tasas de IVA, restricciones aduaneras y monedas (`PARAM_MONEDA`) de forma puramente paramétrica.
   - **Segregación Estricta (`RN20`):** El `ADMINISTRADOR` no tiene acceso a usuarios, contraseñas, roles ni auditoría. Si intenta invocar `/api/seguridad/**`, el filtro RBAC rechaza la petición con **`HTTP 403 Forbidden`** y asienta automáticamente el intento en `AUDITORIA`.
3. **Módulo Independiente de Seguridad (`OFICIAL_SEGURIDAD` — `CU14`, `RF21`, `RF23`, `RNF01`, `RNF08`):**
   - Opera en su propia consola autónoma (`/seguridad`, tema Pizarra `#0F172A` y Ámbar `#D97706`):
     - **Hasheo `bcrypt` Costo 12 (`RNF01`):** Crea cuentas internas en `USUARIO` aplicando `bcrypt` con factor de costo 12 y *salt* aleatorio único (`$2a$12$...`), bloqueo automático tras 5 intentos fallidos y expiración de sesión JWT `RS256` a los 15 minutos de inactividad.
     - **Desactivación Lógica (`RN18`):** Impide el borrado físico de cualquier usuario para no romper la integridad referencial del historial; solo permite desactivar o reactivar cuentas lógicamente (`activo = false/true`).
     - **Bitácora `AUDITORIA` Inmutable (`RNF08`, `RN17`):** Visualiza en modo `🔒 INMUTABLE / SOLO LECTURA` quién ejecutó cada operación crítica, la fecha/hora exacta, la entidad afectada y el resultado, bloqueando cualquier intento de edición o eliminación.
