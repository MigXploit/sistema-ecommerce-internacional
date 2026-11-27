import React, { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { IdiomaCode, TEXTOS } from '../i18n';
import { StatusBadge } from './StatusBadge';

interface ProductCardProps {
  producto: any;
  idioma: IdiomaCode;
  onAgregar: (producto: any) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ producto, idioma, onAgregar }) => {
  const [imgCargada, setImgCargada] = useState(false);
  const t = TEXTOS[idioma];

  return (
    <article className="product-card">
      {/* Contenedor 4:3 con skeleton animado (DESIGN.md §3.B) */}
      <div className="product-media-4x3">
        {!imgCargada && <div className="product-skeleton" />}
        <img
          className="product-img"
          src={producto.imagen_url}
          alt={producto.nombre_localizado}
          style={{ opacity: imgCargada ? 1 : 0 }}
          onLoad={() => setImgCargada(true)}
          onError={() => setImgCargada(true)}
        />
      </div>

      <div className="product-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <StatusBadge estado="ACTIVO" texto={producto.categoria} />
          <span className="mono" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {producto.codigo}
          </span>
        </div>

        <h3 className="product-title">{producto.nombre_localizado}</h3>
        <p className="product-desc">{producto.descripcion_localizada}</p>

        <div className="product-meta-mono">
          {t.codigoHs}: <b>{producto.codigo_arancelario}</b> • {producto.peso_kg} kg ({producto.dimensiones} cm → Vol: {producto.pesoVolumetricoKg} kg)
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '8px', gap: '8px' }}>
          <div className="product-price-block">
            <span className="price-tag">
              {producto.simboloMoneda} {Number(producto.precioConvertido).toFixed(2)}{' '}
              <small style={{ fontSize: '12px', fontWeight: 600 }}>{producto.moneda}</small>
            </span>
            {producto.moneda !== 'USD' && (
              <span className="price-usd-ref">
                {t.refBaseUsd}: ${Number(producto.precio_base_usd).toFixed(2)} USD
              </span>
            )}
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-accent)', marginTop: '2px' }}>
              ● {t.stockDisponible}: <span className="mono">{producto.stock}</span>
            </span>
          </div>

          <button className="btn btn-accent" onClick={() => onAgregar(producto)}>
            <ShoppingCart size={16} /> {t.agregarCarrito}
          </button>
        </div>
      </div>
    </article>
  );
};
