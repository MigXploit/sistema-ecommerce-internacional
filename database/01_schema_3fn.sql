-- =============================================================================
-- SISTEMA DE COMERCIO ELECTRÓNICO INTERNACIONAL (INF-241 - GRUPO 12)
-- Esquema Relacional Normalizado en 3FN (14 Relaciones Principales + Tablas Paramétricas)
-- Motor: PostgreSQL 18 | Codificación: UTF-8 | Transaccionalidad: ACID
-- =============================================================================

SET client_encoding = 'UTF8';

-- Limpieza ordenada en caso de recreación controlada en entorno de desarrollo
DROP TABLE IF EXISTS registro_demanda CASCADE;
DROP TABLE IF EXISTS notificacion_cliente CASCADE;
DROP TABLE IF EXISTS param_arancel CASCADE;
DROP TABLE IF EXISTS param_operador_logistico CASCADE;
DROP TABLE IF EXISTS param_idioma CASCADE;
DROP TABLE IF EXISTS param_moneda CASCADE;
DROP TABLE IF EXISTS param_pais CASCADE;

DROP TABLE IF EXISTS auditoria CASCADE;
DROP TABLE IF EXISTS usuario CASCADE;
DROP TABLE IF EXISTS factura CASCADE;
DROP TABLE IF EXISTS envio CASCADE;
DROP TABLE IF EXISTS reembolso CASCADE;
DROP TABLE IF EXISTS pago CASCADE;
DROP TABLE IF EXISTS detalle_pedido CASCADE;
DROP TABLE IF EXISTS pedido CASCADE;
DROP TABLE IF EXISTS direccion CASCADE;
DROP TABLE IF EXISTS cliente CASCADE;
DROP TABLE IF EXISTS tipo_cambio CASCADE;
DROP TABLE IF EXISTS traduccion_producto CASCADE;
DROP TABLE IF EXISTS precio_producto CASCADE;
DROP TABLE IF EXISTS producto CASCADE;

-- =============================================================================
-- TABLAS PARAMÉTRICAS OPERATIVAS (RF22, RNF09 - Administradas por ADMINISTRADOR)
-- =============================================================================

CREATE TABLE param_moneda (
    codigo_moneda VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    simbolo VARCHAR(10) NOT NULL,
    es_base BOOLEAN NOT NULL DEFAULT FALSE,
    habilitada BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE param_idioma (
    codigo_idioma VARCHAR(5) PRIMARY KEY,
    nombre VARCHAR(60) NOT NULL,
    es_defecto BOOLEAN NOT NULL DEFAULT FALSE,
    habilitado BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE param_pais (
    codigo_pais VARCHAR(5) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    moneda_local VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    idioma_defecto VARCHAR(5) NOT NULL REFERENCES param_idioma(codigo_idioma),
    tasa_iva NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (tasa_iva >= 0 AND tasa_iva <= 1),
    tarifa_zona_usd_kg NUMERIC(10,2) NOT NULL DEFAULT 12.00 CHECK (tarifa_zona_usd_kg > 0),
    patron_codigo_postal VARCHAR(120) NOT NULL DEFAULT '^[A-Za-z0-9 -]{3,12}$',
    categorias_restringidas VARCHAR(500) NOT NULL DEFAULT '',
    habilitado BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE param_arancel (
    id_arancel SERIAL PRIMARY KEY,
    codigo_pais VARCHAR(5) NOT NULL REFERENCES param_pais(codigo_pais) ON DELETE CASCADE,
    codigo_arancelario VARCHAR(20) NOT NULL,
    descripcion_partida VARCHAR(200) NOT NULL,
    tasa_arancel NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (tasa_arancel >= 0 AND tasa_arancel <= 1),
    restringido BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (codigo_pais, codigo_arancelario)
);

CREATE TABLE param_operador_logistico (
    id_operador SERIAL PRIMARY KEY,
    codigo VARCHAR(30) UNIQUE NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    tarifa_base_usd NUMERIC(10,2) NOT NULL CHECK (tarifa_base_usd >= 0),
    tarifa_kg_usd NUMERIC(10,2) NOT NULL CHECK (tarifa_kg_usd > 0),
    dias_transito_estimados INT NOT NULL CHECK (dias_transito_estimados > 0),
    endpoint_api VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- 14 RELACIONES PRINCIPALES EN TERCERA FORMA NORMAL (Sección 7.6.1 y D02)
-- =============================================================================

-- 1. PRODUCTO
CREATE TABLE producto (
    id_producto SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    categoria VARCHAR(80) NOT NULL,
    peso_kg NUMERIC(10,3) NOT NULL CHECK (peso_kg > 0),
    dimensiones VARCHAR(50) NOT NULL, -- Formato Largo x Ancho x Alto en cm (ej. 35x25x8)
    codigo_arancelario VARCHAR(20) NOT NULL,
    precio_base_usd NUMERIC(12,2) NOT NULL CHECK (precio_base_usd > 0),
    stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_defectuoso INT NOT NULL DEFAULT 0 CHECK (stock_defectuoso >= 0), -- RN19 cuarentena/baja
    imagen_url VARCHAR(500),
    estado BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. TIPO_CAMBIO
CREATE TABLE tipo_cambio (
    id_tipo_cambio SERIAL PRIMARY KEY,
    moneda_origen VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    moneda_destino VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    tasa NUMERIC(14,6) NOT NULL CHECK (tasa > 0),
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tipo_cambio_par_fecha ON tipo_cambio(moneda_origen, moneda_destino, fecha DESC);

-- 3. PRECIO_PRODUCTO
CREATE TABLE precio_producto (
    id_precio SERIAL PRIMARY KEY,
    id_producto INT NOT NULL REFERENCES producto(id_producto) ON DELETE CASCADE,
    moneda VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
    id_tipo_cambio INT REFERENCES tipo_cambio(id_tipo_cambio),
    UNIQUE (id_producto, moneda)
);

-- 4. TRADUCCION_PRODUCTO
CREATE TABLE traduccion_producto (
    id_traduccion SERIAL PRIMARY KEY,
    id_producto INT NOT NULL REFERENCES producto(id_producto) ON DELETE CASCADE,
    idioma VARCHAR(5) NOT NULL REFERENCES param_idioma(codigo_idioma),
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    UNIQUE (id_producto, idioma)
);

-- 5. CLIENTE
CREATE TABLE cliente (
    id_cliente SERIAL PRIMARY KEY,
    nombres VARCHAR(120) NOT NULL,
    apellidos VARCHAR(120) NOT NULL,
    correo VARCHAR(180) UNIQUE NOT NULL,
    clave_hash VARCHAR(100) NOT NULL, -- bcrypt factor de costo 12 con salt único (RNF01, CU02)
    pais VARCHAR(5) NOT NULL REFERENCES param_pais(codigo_pais),
    idioma VARCHAR(5) NOT NULL REFERENCES param_idioma(codigo_idioma),
    moneda_preferida VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    datos_fiscales VARCHAR(120) NOT NULL,
    intentos_fallidos INT NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. DIRECCION
CREATE TABLE direccion (
    id_direccion SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ENVIO', 'FACTURACION', 'AMBOS')),
    pais VARCHAR(5) NOT NULL REFERENCES param_pais(codigo_pais),
    ciudad VARCHAR(120) NOT NULL,
    linea_direccion VARCHAR(255) NOT NULL,
    codigo_postal VARCHAR(30) NOT NULL
);

-- 7. PEDIDO
CREATE TABLE pedido (
    id_pedido SERIAL PRIMARY KEY,
    id_cliente INT NOT NULL REFERENCES cliente(id_cliente),
    id_direccion INT NOT NULL REFERENCES direccion(id_direccion),
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moneda VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    tasa_aplicada NUMERIC(14,6) NOT NULL DEFAULT 1.0 CHECK (tasa_aplicada > 0), -- RN02 congelamiento
    idioma_operacion VARCHAR(5) NOT NULL REFERENCES param_idioma(codigo_idioma),
    tipo_venta VARCHAR(20) NOT NULL CHECK (tipo_venta IN ('MINORISTA', 'MAYORISTA', 'PROMOCIONAL')),
    peso_fisico_total NUMERIC(10,3) NOT NULL DEFAULT 0,
    peso_volumetrico_total NUMERIC(10,3) NOT NULL DEFAULT 0,
    peso_tasable NUMERIC(10,3) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    impuestos NUMERIC(12,2) NOT NULL CHECK (impuestos >= 0),
    costo_envio NUMERIC(12,2) NOT NULL CHECK (costo_envio >= 0),
    total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('CREADO', 'PAGADO', 'PREPARADO', 'ENVIADO', 'ENTREGADO', 'DEVUELTO', 'CANCELADO')),
    CONSTRAINT chk_integridad_total_pedido CHECK (total = subtotal + impuestos + costo_envio) -- Invariante 1
);

-- 8. DETALLE_PEDIDO
CREATE TABLE detalle_pedido (
    id_detalle SERIAL PRIMARY KEY,
    id_pedido INT NOT NULL REFERENCES pedido(id_pedido) ON DELETE CASCADE,
    id_producto INT NOT NULL REFERENCES producto(id_producto),
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0)
);

-- 9. PAGO (Cumplimiento PCI DSS: jamás almacena PAN ni CVV - RNF03, RN11)
CREATE TABLE pago (
    id_pago SERIAL PRIMARY KEY,
    id_pedido INT NOT NULL REFERENCES pedido(id_pedido),
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    moneda VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    equivalente_base NUMERIC(12,2) NOT NULL CHECK (equivalente_base > 0), -- Equivalente en USD (RN09)
    medio_pago VARCHAR(30) NOT NULL CHECK (medio_pago IN ('TARJETA', 'TRANSFERENCIA', 'BILLETERA_DIGITAL')),
    token_transaccional VARCHAR(120) NOT NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'REEMBOLSADO')),
    referencia_pasarela VARCHAR(100) UNIQUE NOT NULL,
    fecha_pago TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. USUARIO (Módulo Independiente de Seguridad - definido antes de REEMBOLSO/AUDITORIA por FK)
CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    nombre_completo VARCHAR(160) NOT NULL,
    login VARCHAR(80) UNIQUE NOT NULL,
    clave_hash VARCHAR(100) NOT NULL, -- bcrypt costo 12 con salt aleatorio (RNF01, RN20)
    rol VARCHAR(30) NOT NULL CHECK (rol IN (
        'GESTOR_CATALOGO',
        'GESTOR_PEDIDOS',
        'LOGISTICA',
        'FACTURACION',
        'ADMINISTRADOR',
        'OFICIAL_SEGURIDAD',
        'GERENTE'
    )),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    intentos_fallidos INT NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMP,
    ultimo_acceso TIMESTAMP
);

-- 10. REEMBOLSO (Control postventa y devoluciones por productos defectuosos - RF13, RF19, RN10, RN19)
CREATE TABLE reembolso (
    id_reembolso SERIAL PRIMARY KEY,
    id_pago INT NOT NULL REFERENCES pago(id_pago),
    id_producto_afectado INT REFERENCES producto(id_producto),
    unidades_defectuosas INT NOT NULL DEFAULT 0 CHECK (unidades_defectuosas >= 0),
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    causal_devolucion VARCHAR(40) NOT NULL CHECK (causal_devolucion IN (
        'PRODUCTO_DEFECTUOSO',
        'DANO_TRANSPORTE',
        'ERROR_ENVIO',
        'RECHAZO_ADUANA',
        'CANCELACION'
    )),
    motivo TEXT NOT NULL,
    evidencia_ref VARCHAR(500), -- Obligatorio en PRODUCTO_DEFECTUOSO (RN19)
    inspeccion_aprobada BOOLEAN NOT NULL DEFAULT FALSE,
    id_usuario_autoriza INT REFERENCES usuario(id_usuario),
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
    fecha_reembolso TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. ENVIO
CREATE TABLE envio (
    id_envio SERIAL PRIMARY KEY,
    id_pedido INT UNIQUE NOT NULL REFERENCES pedido(id_pedido),
    operador VARCHAR(100) NOT NULL,
    numero_guia VARCHAR(80) UNIQUE NOT NULL,
    etiqueta_exportacion VARCHAR(500),
    costo NUMERIC(12,2) NOT NULL CHECK (costo >= 0),
    fecha_estimada DATE NOT NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_ADUANA', 'ENTREGADO', 'DEVUELTO')),
    eventos_tracking TEXT NOT NULL DEFAULT '[]'
);

-- 12. FACTURA (Inmutable RN15, RN16; soporta Factura Comercial única por pedido y Notas de Crédito vinculadas)
CREATE TABLE factura (
    id_factura SERIAL PRIMARY KEY,
    id_pedido INT NOT NULL REFERENCES pedido(id_pedido),
    tipo_documento VARCHAR(20) NOT NULL DEFAULT 'FACTURA' CHECK (tipo_documento IN ('FACTURA', 'NOTA_CREDITO')),
    id_factura_origen INT REFERENCES factura(id_factura),
    id_reembolso INT REFERENCES reembolso(id_reembolso),
    numero VARCHAR(60) UNIQUE NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pais VARCHAR(5) NOT NULL REFERENCES param_pais(codigo_pais),
    datos_fiscales_cliente VARCHAR(150) NOT NULL,
    moneda VARCHAR(10) NOT NULL REFERENCES param_moneda(codigo_moneda),
    subtotal NUMERIC(12,2) NOT NULL,
    impuestos NUMERIC(12,2) NOT NULL,
    total NUMERIC(12,2) NOT NULL,
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('EMITIDA', 'ANULADA'))
);

-- RN15: Exactamente una única Factura Comercial por pedido (las Notas de Crédito se vinculan sin violar unicidad)
CREATE UNIQUE INDEX uq_factura_comercial_por_pedido
    ON factura(id_pedido)
    WHERE tipo_documento = 'FACTURA';

-- 14. AUDITORIA (Registro inmutable de operaciones críticas - RF23, RNF08, RN17, RN20)
CREATE TABLE auditoria (
    id_auditoria SERIAL PRIMARY KEY,
    id_usuario INT REFERENCES usuario(id_usuario),
    actor VARCHAR(120) NOT NULL DEFAULT 'SISTEMA',
    fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    operacion VARCHAR(100) NOT NULL,
    entidad VARCHAR(60) NOT NULL,
    id_entidad INT,
    resultado VARCHAR(40) NOT NULL,
    detalle TEXT
);

-- =============================================================================
-- TABLAS DE TRAZABILIDAD DE NOTIFICACIONES Y DEMANDA ANALÍTICA (RF04, RF18, RF24)
-- =============================================================================

CREATE TABLE notificacion_cliente (
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
);

CREATE TABLE registro_demanda (
    id_demanda SERIAL PRIMARY KEY,
    id_producto INT REFERENCES producto(id_producto) ON DELETE SET NULL,
    tipo_solicitud VARCHAR(40) NOT NULL CHECK (tipo_solicitud IN ('CONSULTA_PRODUCTO', 'BUSQUEDA_CATALOGO', 'AGREGADO_CARRITO', 'COTIZACION_PAIS', 'RECLAMO_POSTVENTA')),
    termino_referencia VARCHAR(200),
    pais VARCHAR(5),
    idioma VARCHAR(5),
    moneda VARCHAR(10),
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pedido_reportes ON pedido(tipo_venta, idioma_operacion, moneda, fecha);
CREATE INDEX idx_demanda_tipo ON registro_demanda(tipo_solicitud, id_producto);
