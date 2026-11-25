-- =============================================================================
-- SISTEMA DE COMERCIO ELECTRÓNICO INTERNACIONAL (INF-241 - GRUPO 12)
-- Datos Semilla Coherentes con Diagrama de Objetos D13, Roles RBAC y Prototipos
-- Todas las contraseñas emplean bcrypt factor de costo 12 ($2a$12$...)
-- =============================================================================

SET client_encoding = 'UTF8';

-- 1. MONEDAS HABILITADAS (ISO 4217 - RNF07)
INSERT INTO param_moneda (codigo_moneda, nombre, simbolo, es_base, habilitada) VALUES
('USD', 'Dólar Estadounidense (Moneda Base)', '$', TRUE, TRUE),
('BOB', 'Boliviano', 'Bs', FALSE, TRUE),
('EUR', 'Euro', '€', FALSE, TRUE),
('BRL', 'Real Brasileño', 'R$', FALSE, TRUE);

-- 2. IDIOMAS HABILITADOS (RF03, RNF07)
INSERT INTO param_idioma (codigo_idioma, nombre, es_defecto, habilitado) VALUES
('ES', 'Español', TRUE, TRUE),
('EN', 'English', FALSE, TRUE),
('PT', 'Português', FALSE, TRUE);

-- 3. PAÍSES Y REGLAS FISCALES / ADUANERAS (RF09, RN12)
INSERT INTO param_pais (codigo_pais, nombre, moneda_local, idioma_defecto, tasa_iva, tarifa_zona_usd_kg, patron_codigo_postal, categorias_restringidas, habilitado) VALUES
('BR', 'Brasil', 'BRL', 'PT', 0.1200, 18.75, '^[0-9]{5}-?[0-9]{3}$', 'Alimentos Perecederos', TRUE),
('US', 'Estados Unidos', 'USD', 'EN', 0.0800, 15.00, '^[0-9]{5}(-[0-9]{4})?$', '', TRUE),
('ES', 'España', 'EUR', 'ES', 0.2100, 22.00, '^[0-9]{5}$', '', TRUE),
('BO', 'Bolivia', 'BOB', 'ES', 0.1300, 8.00, '^[0-9]{4}$', '', TRUE),
('DE', 'Alemania', 'EUR', 'EN', 0.1900, 24.00, '^[0-9]{5}$', '', TRUE),
('XX', 'Territorio Sancionado (No Habilitado)', 'USD', 'EN', 0.0000, 50.00, '^.*$', 'Ropa,Joyería,Artesanía,Alimentos', FALSE);

-- 4. PARTIDAS ARANCELARIAS POR PAÍS (HS Code - RF09)
INSERT INTO param_arancel (codigo_pais, codigo_arancelario, descripcion_partida, tasa_arancel, restringido) VALUES
('BR', '6201.99', 'Prendas exteriores de fibra de camélido (Alpaca)', 0.0800, FALSE),
('BR', '7113.11', 'Joyería de plata de ley y piedras andinas', 0.1000, FALSE),
('BR', '0901.21', 'Café tostado de altura orgánico', 0.0600, FALSE),
('BR', '4202.21', 'Marroquinería artesanal de cuero', 0.0900, FALSE),
('US', '6201.99', 'Alpaca wool outerwear garments', 0.0400, FALSE),
('US', '7113.11', 'Sterling silver jewelry', 0.0500, FALSE),
('US', '0901.21', 'Organic roasted specialty coffee', 0.0000, FALSE),
('US', '4202.21', 'Handcrafted leather bags', 0.0600, FALSE),
('ES', '6201.99', 'Prendas de abrigo de lana fina', 0.0500, FALSE),
('ES', '7113.11', 'Artículos de joyería de plata', 0.0400, FALSE),
('ES', '0901.21', 'Café arábica tostado en grano', 0.0300, FALSE),
('BO', '6201.99', 'Prendas nacionales de alpaca', 0.0000, FALSE),
('DE', '6201.99', 'Alpaka Oberbekleidung', 0.0500, FALSE);

-- 5. OPERADORES LOGÍSTICOS EXTERNOS (RF10, RF14)
INSERT INTO param_operador_logistico (codigo, nombre, tarifa_base_usd, tarifa_kg_usd, dias_transito_estimados, endpoint_api, activo) VALUES
('COURIER_GLOBAL', 'Courier Global Express', 15.00, 9.375, 5, 'https://api.courierglobal.example/v1/shipments', TRUE),
('DHL_INTL', 'DHL Express International', 22.00, 12.50, 3, 'https://api.dhl-mock.example/v2/dispatch', TRUE),
('FEDEX_LATAM', 'FedEx Priority Cargo', 19.00, 11.00, 4, 'https://api.fedex-mock.example/v1/rates', TRUE);

-- 6. TIPOS DE CAMBIO VIGENTES RESPECTO A USD (RF12, RN03, Diagrama D13: BRL = 5.00)
INSERT INTO tipo_cambio (moneda_origen, moneda_destino, tasa, fecha) VALUES
('USD', 'USD', 1.000000, CURRENT_TIMESTAMP),
('USD', 'BRL', 5.000000, CURRENT_TIMESTAMP),
('USD', 'BOB', 6.960000, CURRENT_TIMESTAMP),
('USD', 'EUR', 0.920000, CURRENT_TIMESTAMP);

-- 7. USUARIOS DEL MÓDULO INDEPENDIENTE DE SEGURIDAD (CU14, RF21, RN18, RN20)
-- Credenciales de demostración (bcrypt cost 12):
--   seguridad        -> Seguridad2026!   (OFICIAL_SEGURIDAD)
--   admin.parametros -> AdminParam2026!  (ADMINISTRADOR - sin acceso a seguridad)
--   catalogo         -> Catalogo2026!    (GESTOR_CATALOGO)
--   pedidos          -> Pedidos2026!     (GESTOR_PEDIDOS)
--   logistica        -> Logistica2026!   (LOGISTICA)
--   facturacion      -> Factura2026!     (FACTURACION)
--   gerencia         -> Gerencia2026!    (GERENTE)
--   ex.operador      -> Inactivo2026!    (LOGISTICA - desactivado lógicamente RN18)
INSERT INTO usuario (nombre_completo, login, clave_hash, rol, activo) VALUES
('Elena Vargas (Oficial de Seguridad)', 'seguridad', '$2a$12$VYN0k4neG6kJgYP6zWSTjO.kMGMOugLYlkC2isft3v7xMdyJ34zcu', 'OFICIAL_SEGURIDAD', TRUE),
('Carlos Mendoza (Administrador de Parámetros)', 'admin.parametros', '$2a$12$TmbnnoYeW5C2wrgJST0gE.909s30S.4RFwTgSxTFCn9DMMFg2sivS', 'ADMINISTRADOR', TRUE),
('Lucía Quispe (Gestora de Catálogo)', 'catalogo', '$2a$12$k9jtYRbRxe/iwxcpMx.Bc.2wvRVQ7AlbOe0HFv4gE4E9/jXI1qc3q', 'GESTOR_CATALOGO', TRUE),
('Marco Flores (Gestor de Pedidos)', 'pedidos', '$2a$12$wN9oYlCU7l.v7Dm8lUT19uKtj.K8gXPjDEfRVaUcp4FD.LNo/51g.', 'GESTOR_PEDIDOS', TRUE),
('Andrés Mamani (Responsable de Logística)', 'logistica', '$2a$12$JrGWKNYP0b6u5adKvqy3h.DP/.J5inshwGb7YGbFudx5X.4e6kZdu', 'LOGISTICA', TRUE),
('Valeria Pinto (Responsable de Facturación)', 'facturacion', '$2a$12$4aOKb4p1KbRZjzLkxYHk6Om.cR6oEjGLRvVCc3IIxp3IvgXNzjstW', 'FACTURACION', TRUE),
('Roberto Bustillos (Gerente General)', 'gerencia', '$2a$12$Yx39LYQvqfGR66yrKm5GTe3zrlLpLAvR046ji.4U76RRIoh8raBQ6', 'GERENTE', TRUE),
('Jorge Ticona (Ex Operador Desactivado)', 'ex.operador', '$2a$12$siCbqUppOWMM16tWEHZk6ej1T5arRBkP8IEkVc/hlOL0Xb5jkZ44K', 'LOGISTICA', FALSE);

-- 8. CATÁLOGO DE PRODUCTOS DE EXPORTACIÓN (RF01-RF04, D13: PRD-ALP-001)
INSERT INTO producto (codigo, categoria, peso_kg, dimensiones, codigo_arancelario, precio_base_usd, stock, stock_defectuoso, imagen_url, estado) VALUES
('PRD-ALP-001', 'Ropa', 0.800, '35x25x8', '6201.99', 120.00, 42, 0, 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=600&q=80', TRUE),
('PRD-JOY-002', 'Joyería', 0.250, '15x15x6', '7113.11', 85.00, 28, 1, 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80', TRUE),
('PRD-CAF-003', 'Alimentos', 1.200, '28x18x12', '0901.21', 34.00, 95, 0, 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=600&q=80', TRUE),
('PRD-MAR-004', 'Marroquinería', 1.450, '42x32x15', '4202.21', 160.00, 19, 0, 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=600&q=80', TRUE),
('PRD-ALP-005', 'Ropa', 0.450, '30x20x5', '6201.99', 65.00, 60, 0, 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?auto=format&fit=crop&w=600&q=80', TRUE);

-- 9. TRADUCCIONES MULTILENGUAJE (ES, EN, PT - RF03)
INSERT INTO traduccion_producto (id_producto, idioma, nombre, descripcion) VALUES
(1, 'ES', 'Chaqueta de Alpaca Real Andina', 'Prenda térmica tejida en fibra 100% baby alpaca de exportación con acabado impermeable ligero.'),
(1, 'EN', 'Royal Andean Baby Alpaca Jacket', 'Thermal outerwear crafted from 100% export-grade baby alpaca wool with breathable finish.'),
(1, 'PT', 'Jaqueta de alpaca', 'Casaco térmico confeccionado em fibra 100% baby alpaca de exportação com acabamento premium.'),

(2, 'ES', 'Collar de Plata 950 y Bolivianita', 'Joyería de autor en plata esterlina 950 engarzada con gema ametista-citrino certificada.'),
(2, 'EN', '950 Sterling Silver & Bolivianite Necklace', 'Handcrafted 950 sterling silver necklace set with certified natural Bolivianite gemstone.'),
(2, 'PT', 'Colar de Prata 950 e Bolivianita', 'Joia artesanal em prata 950 cravejada com gema natural bolivianita certificada.'),

(3, 'ES', 'Café Especial Yungas Altura (Pack 1 kg)', 'Grano entero 100% arábica cultivado a 1.850 msnm, tueste medio con notas a cacao y frutos rojos.'),
(3, 'EN', 'High-Altitude Yungas Specialty Coffee (1 kg)', '100% Arabica whole bean grown at 1,850 masl, medium roast with cocoa and red berry notes.'),
(3, 'PT', 'Café Especial Yungas de Altitude (1 kg)', 'Grão inteiro 100% arábica cultivado a 1.850m, torra média com notas de cacau e frutas vermelhas.'),

(4, 'ES', 'Maletín Ejecutivo de Cuero Flor Artesanal', 'Maletín internacional para portátil de 16 pulgadas cosido a mano con herrajes de bronce.'),
(4, 'EN', 'Handcrafted Full-Grain Leather Briefcase', 'Executive 16-inch laptop briefcase hand-stitched in full-grain leather with brass hardware.'),
(4, 'PT', 'Pasta Executiva de Couro Legítimo Artesanal', 'Pasta executiva para notebook de 16 polegadas costurada à mão em couro legítimo.'),

(5, 'ES', 'Bufanda Tejida en Baby Alpaca', 'Bufanda suave hipoalergénica en telar tradicional andino para invierno internacional.'),
(5, 'EN', 'Woven Baby Alpaca Winter Scarf', 'Hypoallergenic ultra-soft scarf woven on traditional Andean looms.'),
(5, 'PT', 'Cachecol Tecido em Baby Alpaca', 'Cachecol hipoalergênico super macio tecido em tear tradicional andino.');

-- 10. PRECIOS MULTIMONEDA CALCULADOS (RF02)
INSERT INTO precio_producto (id_producto, moneda, valor, id_tipo_cambio) VALUES
(1, 'USD', 120.00, 1), (1, 'BRL', 600.00, 2), (1, 'BOB', 835.20, 3), (1, 'EUR', 110.40, 4),
(2, 'USD', 85.00, 1),  (2, 'BRL', 425.00, 2), (2, 'BOB', 591.60, 3), (2, 'EUR', 78.20, 4),
(3, 'USD', 34.00, 1),  (3, 'BRL', 170.00, 2), (3, 'BOB', 236.64, 3), (3, 'EUR', 31.28, 4),
(4, 'USD', 160.00, 1), (4, 'BRL', 800.00, 2), (4, 'BOB', 1113.60, 3),(4, 'EUR', 147.20, 4),
(5, 'USD', 65.00, 1),  (5, 'BRL', 325.00, 2), (5, 'BOB', 452.40, 3), (5, 'EUR', 59.80, 4);

-- 11. CLIENTES INTERNACIONALES (Contraseña común demo: Cliente2026!)
INSERT INTO cliente (nombres, apellidos, correo, clave_hash, pais, idioma, moneda_preferida, datos_fiscales) VALUES
('Carla', 'Santos', 'carla.santos@email.br', '$2a$12$1IOUwLzJPaL6xRXe0H27g.BiN5/uvg0vI/QZEX1w4GqIFtuNTgXNa', 'BR', 'PT', 'BRL', 'ID-FISCAL-BR-0091'),
('John', 'Miller', 'john.miller@globalcorp.us', '$2a$12$1IOUwLzJPaL6xRXe0H27g.BiN5/uvg0vI/QZEX1w4GqIFtuNTgXNa', 'US', 'EN', 'USD', 'EIN-94-3829104'),
('Sofía', 'García', 'sofia.garcia@importaciones.es', '$2a$12$1IOUwLzJPaL6xRXe0H27g.BiN5/uvg0vI/QZEX1w4GqIFtuNTgXNa', 'ES', 'ES', 'EUR', 'NIF-B84920112'),
('Diego', 'Rojas', 'diego.rojas@comercio.bo', '$2a$12$1IOUwLzJPaL6xRXe0H27g.BiN5/uvg0vI/QZEX1w4GqIFtuNTgXNa', 'BO', 'ES', 'BOB', 'NIT-4829102015');

-- 12. DIRECCIONES INTERNACIONALES
INSERT INTO direccion (id_cliente, tipo, pais, ciudad, linea_direccion, codigo_postal) VALUES
(1, 'ENVIO', 'BR', 'Sao Paulo', 'Rua Exemplo 123', '01000-000'),
(2, 'AMBOS', 'US', 'Miami', '742 Brickell Ave Suite 400', '33131'),
(3, 'AMBOS', 'ES', 'Madrid', 'Calle Gran Vía 48 Piso 3', '28013'),
(4, 'ENVIO', 'BO', 'La Paz', 'Av. 16 de Julio 1490', '0000');

-- 13. PEDIDOS DEMOSTRATIVOS
-- Pedido #1: Exactamente el escenario del Diagrama de Objetos D13 (Carla Santos, Brasil, BRL, ENVIADO)
INSERT INTO pedido (id_cliente, id_direccion, fecha, moneda, tasa_aplicada, idioma_operacion, tipo_venta, peso_fisico_total, peso_volumetrico_total, peso_tasable, subtotal, impuestos, costo_envio, total, estado) VALUES
(1, 1, CURRENT_TIMESTAMP - INTERVAL '4 days', 'BRL', 5.000000, 'PT', 'MINORISTA', 1.600, 2.800, 2.800, 1200.00, 240.00, 150.00, 1590.00, 'ENVIADO'),
-- Pedido #2: John Miller (US, MAYORISTA, PAGADO -> Listo en Bandeja de Logística para emitir guía en 1 clic CU07)
(2, 2, CURRENT_TIMESTAMP - INTERVAL '1 day', 'USD', 1.000000, 'EN', 'MAYORISTA', 12.000, 12.096, 12.096, 340.00, 27.20, 45.00, 412.20, 'PAGADO'),
-- Pedido #3: Sofía García (ES, MINORISTA, ENTREGADO -> Listo para probar Devolución por Producto Defectuoso CU11)
(3, 3, CURRENT_TIMESTAMP - INTERVAL '9 days', 'EUR', 0.920000, 'ES', 'MINORISTA', 1.450, 4.032, 4.032, 147.20, 38.27, 36.80, 222.27, 'ENTREGADO'),
-- Pedido #4: Carla Santos (BR, PROMOCIONAL, DEVUELTO -> Ejemplo completo con inspección de defecto, reembolso y Nota de Crédito)
(1, 1, CURRENT_TIMESTAMP - INTERVAL '14 days', 'BRL', 5.000000, 'PT', 'PROMOCIONAL', 0.250, 0.270, 0.270, 425.00, 93.50, 85.00, 603.50, 'DEVUELTO');

-- 14. DETALLE_PEDIDO
INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario) VALUES
(1, 1, 2, 600.00),
(2, 3, 10, 34.00),
(3, 4, 1, 147.20),
(4, 2, 1, 425.00);

-- 15. PAGOS INTERNACIONALES (Sin PAN ni CVV - PCI DSS)
INSERT INTO pago (id_pedido, monto, moneda, equivalente_base, medio_pago, token_transaccional, estado, referencia_pasarela, fecha_pago) VALUES
(1, 1590.00, 'BRL', 318.00, 'TARJETA', 'tok_visa_br_99182', 'APROBADO', 'PG-REF-7781', CURRENT_TIMESTAMP - INTERVAL '4 days'),
(2, 412.20, 'USD', 412.20, 'TRANSFERENCIA', 'tok_ach_us_44210', 'APROBADO', 'PG-REF-8802', CURRENT_TIMESTAMP - INTERVAL '1 day'),
(3, 222.27, 'EUR', 241.60, 'TARJETA', 'tok_mc_es_77319', 'APROBADO', 'PG-REF-8915', CURRENT_TIMESTAMP - INTERVAL '9 days'),
(4, 603.50, 'BRL', 120.70, 'BILLETERA_DIGITAL', 'tok_pix_br_66104', 'REEMBOLSADO', 'PG-REF-7104', CURRENT_TIMESTAMP - INTERVAL '14 days');

-- 16. ENVÍOS INTERNACIONALES
INSERT INTO envio (id_pedido, operador, numero_guia, etiqueta_exportacion, costo, fecha_estimada, estado, eventos_tracking) VALUES
(1, 'Courier Global', 'CG-2026-000731', 'LBL-EXPORT-BR-000731.pdf', 150.00, CURRENT_DATE + 3, 'EN_TRANSITO',
 '[{"fecha":"2026-11-20 10:15","estado":"PENDIENTE","detalle":"Guía internacional emitida"},{"fecha":"2026-11-21 08:30","estado":"EN_TRANSITO","detalle":"Despacho aéreo internacional La Paz -> Sao Paulo"}]'),
(3, 'DHL Express International', 'DHL-2026-004192', 'LBL-EXPORT-ES-004192.pdf', 36.80, CURRENT_DATE - 3, 'ENTREGADO',
 '[{"fecha":"2026-11-15 14:00","estado":"EN_TRANSITO","detalle":"Salida de centro logístico"},{"fecha":"2026-11-17 09:20","estado":"EN_ADUANA","detalle":"Revisión documental Aduana Barajas Madrid"},{"fecha":"2026-11-18 11:00","estado":"EN_TRANSITO","detalle":"Liberado por aduana"},{"fecha":"2026-11-19 16:40","estado":"ENTREGADO","detalle":"Entregado a Sofía García"}]'),
(4, 'Courier Global', 'CG-2026-000512', 'LBL-EXPORT-BR-000512.pdf', 85.00, CURRENT_DATE - 8, 'ENTREGADO',
 '[{"fecha":"2026-11-11 09:00","estado":"EN_TRANSITO","detalle":"En tránsito"},{"fecha":"2026-11-15 15:10","estado":"ENTREGADO","detalle":"Entregado en destino"}]');

-- 17. REEMBOLSO CONTROLADO POR PRODUCTO DEFECTUOSO (Pedido #4)
INSERT INTO reembolso (id_pago, id_producto_afectado, unidades_defectuosas, monto, causal_devolucion, motivo, evidencia_ref, inspeccion_aprobada, id_usuario_autoriza, estado, fecha_reembolso) VALUES
(4, 2, 1, 603.50, 'PRODUCTO_DEFECTUOSO', 'Broche de plata llegó con fisura de fábrica comprobada en inspección.', 'EVID-FOTO-BR-2026-044.jpg', TRUE, 4, 'APROBADO', CURRENT_TIMESTAMP - INTERVAL '6 days');

-- 18. FACTURAS COMERCIALES Y NOTAS DE CRÉDITO INMUTABLES (RN15, RN16)
INSERT INTO factura (id_pedido, tipo_documento, id_factura_origen, id_reembolso, numero, fecha, pais, datos_fiscales_cliente, moneda, subtotal, impuestos, total, estado) VALUES
(1, 'FACTURA', NULL, NULL, 'FAC-BR-2026-0088', CURRENT_TIMESTAMP - INTERVAL '4 days', 'BR', 'ID-FISCAL-BR-0091', 'BRL', 1200.00, 240.00, 1590.00, 'EMITIDA'),
(2, 'FACTURA', NULL, NULL, 'FAC-US-2026-0089', CURRENT_TIMESTAMP - INTERVAL '1 day', 'US', 'EIN-94-3829104', 'USD', 340.00, 27.20, 412.20, 'EMITIDA'),
(3, 'FACTURA', NULL, NULL, 'FAC-ES-2026-0090', CURRENT_TIMESTAMP - INTERVAL '9 days', 'ES', 'NIF-B84920112', 'EUR', 147.20, 38.27, 222.27, 'EMITIDA'),
(4, 'FACTURA', NULL, NULL, 'FAC-BR-2026-0081', CURRENT_TIMESTAMP - INTERVAL '14 days', 'BR', 'ID-FISCAL-BR-0091', 'BRL', 425.00, 93.50, 603.50, 'EMITIDA'),
(4, 'NOTA_CREDITO', 4, 1, 'NC-BR-2026-0012', CURRENT_TIMESTAMP - INTERVAL '6 days', 'BR', 'ID-FISCAL-BR-0091', 'BRL', 425.00, 93.50, 603.50, 'EMITIDA');

-- 19. NOTIFICACIONES LOCALIZADAS ENVIADAS (CU10, RF18)
INSERT INTO notificacion_cliente (id_cliente, id_pedido, idioma, evento, destinatario_correo, asunto, cuerpo) VALUES
(1, 1, 'PT', 'GUIA_EMITIDA', 'carla.santos@email.br', 'Seu pedido #1 está em trânsito - Guia CG-2026-000731', 'Olá Carla, seu pagamento de R$ 1590.00 foi aprovado (Fatura FAC-BR-2026-0088) e seu pacote segue com código CG-2026-000731.'),
(2, 2, 'EN', 'PAGO_APROBADO', 'john.miller@globalcorp.us', 'Order #2 Payment Confirmed - Invoice FAC-US-2026-0089', 'Hello John, your payment of $412.20 USD was approved. Logistics is preparing your export airwaybill.'),
(3, 3, 'ES', 'PEDIDO_ENTREGADO', 'sofia.garcia@importaciones.es', 'Pedido #3 entregado en Madrid - Factura FAC-ES-2026-0090', 'Hola Sofía, DHL Express confirmó la entrega final de tu pedido #3.');

-- 20. REGISTROS DE DEMANDA Y SOLICITUDES DE CLIENTES (RF04, RF24)
INSERT INTO registro_demanda (id_producto, tipo_solicitud, termino_referencia, pais, idioma, moneda) VALUES
(1, 'CONSULTA_PRODUCTO', 'Jaqueta de alpaca', 'BR', 'PT', 'BRL'),
(1, 'CONSULTA_PRODUCTO', 'Baby Alpaca Jacket', 'US', 'EN', 'USD'),
(1, 'AGREGADO_CARRITO', 'PRD-ALP-001', 'BR', 'PT', 'BRL'),
(1, 'CONSULTA_PRODUCTO', 'Chaqueta de Alpaca', 'ES', 'ES', 'EUR'),
(3, 'CONSULTA_PRODUCTO', 'Specialty Coffee Yungas', 'US', 'EN', 'USD'),
(3, 'AGREGADO_CARRITO', 'PRD-CAF-003 (Mayorista)', 'US', 'EN', 'USD'),
(4, 'CONSULTA_PRODUCTO', 'Maletín cuero ejecutivo', 'ES', 'ES', 'EUR'),
(2, 'RECLAMO_POSTVENTA', 'Solicitud garantía broche plata', 'BR', 'PT', 'BRL'),
(5, 'BUSQUEDA_CATALOGO', 'alpaca winter scarf', 'DE', 'EN', 'EUR'),
(1, 'BUSQUEDA_CATALOGO', 'alpaca coat export', 'US', 'EN', 'USD');

-- 21. AUDITORÍA INMUTABLE INICIAL (RF23, RN17)
INSERT INTO auditoria (id_usuario, actor, operacion, entidad, id_entidad, resultado, detalle) VALUES
(1, 'seguridad', 'INICIALIZACION_RBAC_BCRYPT', 'USUARIO', 1, 'EXITOSO', 'Políticas bcrypt costo 12 y segregación de roles activadas en módulo autónomo de Seguridad'),
(3, 'catalogo', 'PUBLICACION_PRODUCTO_MULTIMONEDA', 'PRODUCTO', 1, 'EXITOSO', 'SKU PRD-ALP-001 registrado con traducciones ES/EN/PT y precios USD/BRL/BOB/EUR'),
(NULL, 'carla.santos@email.br', 'PAGO_INTERNACIONAL_APROBADO', 'PAGO', 1, 'EXITOSO', 'Cobro PG-REF-7781 por 1590.00 BRL (equiv. 318.00 USD) y emisión FAC-BR-2026-0088'),
(5, 'logistica', 'EMISION_GUIA_EXPORTACION', 'ENVIO', 1, 'EXITOSO', 'Guía CG-2026-000731 generada con Courier Global para pedido #1'),
(4, 'pedidos', 'REEMBOLSO_PRODUCTO_DEFECTUOSO', 'REEMBOLSO', 1, 'EXITOSO', 'Aislamiento de 1 unidad defectuosa PRD-JOY-002, reembolso 603.50 BRL y Nota de Crédito NC-BR-2026-0012'),
(2, 'admin.parametros', 'INTENTO_ACCESO_MODULO_SEGURIDAD', 'SEGURIDAD', NULL, 'BLOQUEADO_403', 'Segregación RN20 verificada: Administrador de Parámetros bloqueado al intentar leer cuentas de seguridad');
