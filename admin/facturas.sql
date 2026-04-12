-- ==========================================
-- Script SQL para crear tablas de facturas y clientes en Supabase
-- Ejecutar este script en el Editor SQL de Supabase
-- ==========================================

-- ==========================================
-- 0. Crear tabla clientes
-- ==========================================

CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    identificacion TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    direccion TEXT,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscar clientes por identificación
CREATE INDEX IF NOT EXISTS idx_clientes_identificacion ON clientes(identificacion);

-- ==========================================
-- 1. Crear tabla facturas
-- ==========================================

CREATE TABLE IF NOT EXISTS facturas (
    id SERIAL PRIMARY KEY,
    numero_factura TEXT UNIQUE NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nombre TEXT NOT NULL,
    cliente_identificacion TEXT NOT NULL,
    cliente_email TEXT,
    cliente_telefono TEXT,
    items JSONB,
    subtotal NUMERIC DEFAULT 0,
    iva NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    metodo_pago TEXT DEFAULT 'efectivo',
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    estado TEXT DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada'))
);

-- ==========================================
-- 2. Crear tabla detalle_facturas
-- ==========================================

CREATE TABLE IF NOT EXISTS detalle_facturas (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER REFERENCES facturas(id) ON DELETE CASCADE,
    producto_id INTEGER,
    producto_nombre TEXT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL,
    talla TEXT  -- Nueva columna para almacenar la talla del producto
);

-- ==========================================
-- 3. Crear índice para mejor rendimiento
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_facturas_numero ON facturas(numero_factura);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas(estado);
CREATE INDEX IF NOT EXISTS idx_detalle_facturas_factura ON detalle_facturas(factura_id);

-- ==========================================
-- 4. Función para generar número de factura automático
-- ==========================================

CREATE OR REPLACE FUNCTION generar_numero_factura()
RETURNS TEXT AS $$
DECLARE
    siguiente_numero INTEGER;
    anno TEXT;
    mes TEXT;
    numero_generado TEXT;
BEGIN
    -- Obtener el año y mes actual
    anno := TO_CHAR(NOW(), 'YYYY');
    mes := TO_CHAR(NOW(), 'MM');
    
    -- Obtener el siguiente número de factura del año
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_factura FROM 8 FOR 6) AS INTEGER)), 0) + 1
    INTO siguiente_numero
    FROM facturas
    WHERE numero_factura LIKE anno || mes || '-%';
    
    -- Generar el número de factura formato: AAAAMM-000001
    numero_generado := anno || '-' || LPAD(siguiente_numero::TEXT, 6, '0');
    
    RETURN numero_generado;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 5. Función RPC para descontar stock
-- ==========================================

CREATE OR REPLACE FUNCTION descontar_stock(
    p_producto_id INTEGER,
    p_cantidad INTEGER,
    p_talla TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_stock_actual INTEGER;
    v_stock_talla TEXT;
    v_resultado JSONB;
BEGIN
    -- Si hay talla específica, descontar del stock de esa talla
    IF p_talla IS NOT NULL AND p_talla <> '' THEN
        v_stock_talla := 'stock_' || LOWER(REPLACE(p_talla, '-', '_'));
        
        EXECUTE format('SELECT %s FROM productos WHERE id = $1', v_stock_talla)
        INTO v_stock_actual
        USING p_producto_id;
        
        IF v_stock_actual IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Talla no encontrada');
        END IF;
        
        IF v_stock_actual < p_cantidad THEN
            RETURN jsonb_build_object('success', false, 'message', 'Stock insuficiente');
        END IF;
        
        EXECUTE format('UPDATE productos SET %s = %s - $1, updated_at = NOW() WHERE id = $2', v_stock_talla, v_stock_talla)
        USING p_cantidad, p_producto_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Stock descontado');
    ELSE
        SELECT stock INTO v_stock_actual FROM productos WHERE id = p_producto_id;
        
        IF v_stock_actual IS NULL OR v_stock_actual < p_cantidad THEN
            RETURN jsonb_build_object('success', false, 'message', 'Stock insuficiente');
        END IF;
        
        UPDATE productos SET stock = stock - p_cantidad, updated_at = NOW() WHERE id = p_producto_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Stock descontado');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 6. Función para procesar una factura completa (crear factura + descontar stock)
-- ==========================================

CREATE OR REPLACE FUNCTION crear_factura_con_stock(
    p_cliente_nombre TEXT,
    p_cliente_identificacion TEXT,
    p_cliente_email TEXT DEFAULT NULL,
    p_cliente_telefono TEXT DEFAULT NULL,
    p_items JSONB, -- Array de objetos: [{"producto_id": 1, "cantidad": 2, "talla": "10"}, ...]
    p_metodo_pago TEXT DEFAULT 'efectivo'
)
RETURNS JSONB AS $
DECLARE
    v_factura_id INTEGER;
    v_numero_factura TEXT;
    v_subtotal NUMERIC := 0;
    v_iva NUMERIC := 0;
    v_total NUMERIC := 0;
    v_item JSONB;
    v_producto_id INTEGER;
    v_cantidad INTEGER;
    v_talla TEXT;
    v_cliente_id INTEGER;
    v_existe_cliente BOOLEAN;
    v_stock_talla TEXT;
    v_precio_unitario NUMERIC;
    v_subtotal_item NUMERIC;
    v_stock_actual INTEGER;
    v_error_message TEXT;
BEGIN
    -- Buscar o crear cliente
    SELECT id INTO v_cliente_id FROM clientes WHERE identificacion = p_cliente_identificacion;
    
    IF v_cliente_id IS NULL THEN
        -- Insertar nuevo cliente
        INSERT INTO clientes (identificacion, nombre, email, telefono)
        VALUES (p_cliente_identificacion, p_cliente_nombre, p_cliente_email, p_cliente_telefono)
        RETURNING id INTO v_cliente_id;
    ELSE
        -- Actualizar datos del cliente si hay nuevos datos
        UPDATE clientes 
        SET nombre = COALESCE(p_cliente_nombre, nombre),
            email = COALESCE(p_cliente_email, email),
            telefono = COALESCE(p_cliente_telefono, telefono)
        WHERE id = v_cliente_id;
    END IF;
    
    -- Generar número de factura
    v_numero_factura := generar_numero_factura();

    -- Calcular subtotal e IVA (19% en Colombia)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := (v_item->>'producto_id')::INTEGER;
        v_cantidad := (v_item->>'cantidad')::INTEGER;
        v_talla := (v_item->>'talla')::TEXT;
        
        -- Obtener precio del producto (si hay talla específica, usarla)
        IF v_talla IS NOT NULL AND v_talla <> '' THEN
            v_stock_talla := 'stock_' || LOWER(REPLACE(v_talla, '-', '_'));
            -- Verificar si existe columna de precio para esta talla
            EXECUTE format('SELECT precio_%s FROM productos WHERE id = $1', LOWER(REPLACE(v_talla, '-', '_')))
                INTO v_precio_unitario
                USING v_producto_id;
            
            IF v_precio_unitario IS NULL OR v_precio_unitario = 0 THEN
                SELECT precio INTO v_precio_unitario FROM productos WHERE id = v_producto_id;
            END IF;
        ELSE
            SELECT precio INTO v_precio_unitario FROM productos WHERE id = v_producto_id;
        END IF;

        IF v_precio_unitario IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Producto no encontrado: ' || v_producto_id
            );
        END IF;

        -- Calcular subtotal del item
        v_subtotal_item := v_precio_unitario * v_cantidad;
        v_subtotal := v_subtotal + v_subtotal_item;

        -- Verificar stock antes de procesar (por talla o general)
        IF v_talla IS NOT NULL AND v_talla <> '' THEN
            v_stock_talla := 'stock_' || LOWER(REPLACE(v_talla, '-', '_'));
            EXECUTE format('SELECT %s FROM productos WHERE id = $1', v_stock_talla)
                INTO v_stock_actual
                USING v_producto_id;
        ELSE
            SELECT stock INTO v_stock_actual FROM productos WHERE id = v_producto_id;
        END IF;

        IF v_stock_actual IS NULL THEN
            v_stock_actual := 0;
        END IF;

        IF v_stock_actual < v_cantidad THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Stock insuficiente para producto ID ' || v_producto_id || 
                          COALESCE(' (Talla: ' || v_talla || ')', '') ||
                          '. Stock: ' || v_stock_actual || ', solicitado: ' || v_cantidad
            );
        END IF;
    END LOOP;

    -- Régimen simplificado - No aplica IVA
    v_iva := 0;
    v_total := v_subtotal;

    -- Insertar la factura
    INSERT INTO facturas (
        numero_factura,
        cliente_id,
        cliente_nombre,
        cliente_identificacion,
        cliente_email,
        cliente_telefono,
        items,
        subtotal,
        iva,
        total,
        metodo_pago
    ) VALUES (
        v_numero_factura,
        v_cliente_id,
        p_cliente_nombre,
        p_cliente_identificacion,
        p_cliente_email,
        p_cliente_telefono,
        p_items,
        v_subtotal,
        v_iva,
        v_total,
        p_metodo_pago
    )
    RETURNING id INTO v_factura_id;

    -- Descontar stock de cada producto (por talla si aplica)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := (v_item->>'producto_id')::INTEGER;
        v_cantidad := (v_item->>'cantidad')::INTEGER;
        v_talla := (v_item->>'talla')::TEXT;
        
        -- Descontar stock SOLO por talla (no del stock general cuando hay talla)
        IF v_talla IS NOT NULL AND v_talla <> '' THEN
            v_stock_talla := 'stock_' || LOWER(REPLACE(v_talla, '-', '_'));
            EXECUTE format('UPDATE productos SET %s = %s - $1, updated_at = NOW() WHERE id = $2', 
                v_stock_talla, v_stock_talla)
                USING v_cantidad, v_producto_id;
        ELSE
            -- Solo si no hay talla, descontar del stock general
            UPDATE productos
            SET stock = stock - v_cantidad,
                updated_at = NOW()
            WHERE id = v_producto_id;
        END IF;

        -- Insertar en detalle_facturas (incluyendo talla y precio correcto)
        INSERT INTO detalle_facturas (
            factura_id,
            producto_id,
            producto_nombre,
            cantidad,
            precio_unitario,
            subtotal,
            talla
        )
        SELECT 
            v_factura_id,
            v_producto_id,
            nombre,
            v_cantidad,
            CASE 
                WHEN v_talla IS NOT NULL AND v_talla <> '' THEN
                    COALESCE(
                        (SELECT (row_to_json(p))::jsonb->>
                            ('precio_' || LOWER(REPLACE(v_talla, '-', '_')))
                        FROM productos p WHERE p.id = v_producto_id),
                        precio::TEXT
                    )::NUMERIC
                ELSE precio
            END,
            CASE 
                WHEN v_talla IS NOT NULL AND v_talla <> '' THEN
                    COALESCE(
                        (SELECT (row_to_json(p))::jsonb->>
                            ('precio_' || LOWER(REPLACE(v_talla, '-', '_')))
                        FROM productos p WHERE p.id = v_producto_id),
                        precio::TEXT
                    )::NUMERIC * v_cantidad
                ELSE precio * v_cantidad
            END,
            v_talla
        FROM productos
        WHERE id = v_producto_id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Factura creada correctamente',
        'factura_id', v_factura_id,
        'numero_factura', v_numero_factura,
        'cliente_id', v_cliente_id,
        'cliente_nombre', p_cliente_nombre,
        'subtotal', v_subtotal,
        'iva', v_iva, -- Régimen simplificado: siempre 0
        'total', v_total
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Error al crear factura: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 7. Función para anular una factura (restaurar stock)
-- ==========================================

CREATE OR REPLACE FUNCTION anular_factura(p_factura_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_factura RECORD;
    v_detalle RECORD;
    v_restaurado BOOLEAN := false;
BEGIN
    -- Verificar que la factura existe y está activa
    SELECT * INTO v_factura
    FROM facturas
    WHERE id = p_factura_id AND estado = 'activa';

    IF v_factura IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Factura no encontrada o ya está anulada'
        );
    END IF;

    -- Restaurar stock de cada producto (por talla si aplica)
    FOR v_detalle IN SELECT * FROM detalle_facturas WHERE factura_id = p_factura_id
    LOOP
        -- Restaurar stock por talla específica o general
        IF v_detalle.talla IS NOT NULL AND v_detalle.talla <> '' THEN
            EXECUTE format('UPDATE productos SET stock_%s = stock_%s + $1, updated_at = NOW() WHERE id = $2',
                LOWER(REPLACE(v_detalle.talla, '-', '_')),
                LOWER(REPLACE(v_detalle.talla, '-', '_')))
            USING v_detalle.cantidad, v_detalle.producto_id;
        ELSE
            -- Solo si no hay talla, restaurar del stock general
            UPDATE productos
            SET stock = stock + v_detalle.cantidad,
                updated_at = NOW()
            WHERE id = v_detalle.producto_id;
        END IF;
        
        v_restaurado := true;
    END LOOP;

    -- Cambiar estado de la factura
    UPDATE facturas
    SET estado = 'anulada'
    WHERE id = p_factura_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Factura anulada y stock restaurado',
        'factura_id', p_factura_id,
        'numero_factura', v_factura.numero_factura,
        'stock_restaurado', v_restaurado
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Error al anular factura: ' || SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 8. Habilitar Row Level Security
-- ==========================================

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_facturas ENABLE ROW LEVEL SECURITY;

-- Policy para lectura pública de clientes
CREATE POLICY "Permitir lectura clientes" ON clientes
    FOR SELECT USING (true);

-- Policy para lectura/escritura de facturas
CREATE POLICY "Permitir leer facturas" ON facturas
    FOR SELECT USING (true);

-- ==========================================
-- 9. Función para buscar clientes por identificación
-- ==========================================

CREATE OR REPLACE FUNCTION buscar_cliente(p_identificacion TEXT)
RETURNS JSONB AS $
DECLARE
    v_cliente RECORD;
BEGIN
    SELECT * INTO v_cliente
    FROM clientes
    WHERE identificacion = p_identificacion;
    
    IF v_cliente IS NULL THEN
        RETURN jsonb_build_object(
            'encontrado', false,
            'message', 'Cliente no encontrado'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'encontrado', true,
        'cliente', jsonb_build_object(
            'id', v_cliente.id,
            'identificacion', v_cliente.identificacion,
            'nombre', v_cliente.nombre,
            'email', v_cliente.email,
            'telefono', v_cliente.telefono,
            'direccion', v_cliente.direccion
        )
    );
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 10. Función para obtener historial de compras de un cliente
-- ==========================================

CREATE OR REPLACE FUNCTION historial_cliente(p_cliente_id INTEGER)
RETURNS JSONB AS $
DECLARE
    v_facturas JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'numero_factura', f.numero_factura,
            'fecha', f.fecha_creacion,
            'total', f.total,
            'estado', f.estado,
            'items', f.items
        )
    ) INTO v_facturas
    FROM facturas f
    WHERE f.cliente_id = p_cliente_id AND f.estado = 'activa';
    
    RETURN jsonb_build_object(
        'success', true,
        'facturas', COALESCE(v_facturas, '[]'::JSONB)
    );
END;
$ LANGUAGE plpgsql SECURITY DEFINER;
-- CREATE POLICY "Allow public read facturas" ON facturas FOR SELECT USING (true);
-- CREATE POLICY "Allow public read detalle" ON detalle_facturas FOR SELECT USING (true);

-- ==========================================
-- 9b. Función para buscar clientes por identificación, nombre o teléfono
-- ==========================================

CREATE OR REPLACE FUNCTION buscar_clientes(p_texto TEXT)
RETURNS JSONB AS $
DECLARE
    v_resultados JSONB;
BEGIN
    -- Si el texto está vacío, devolver lista vacía
    IF p_texto IS NULL OR LENGTH(TRIM(p_texto)) < 1 THEN
        RETURN jsonb_build_object(
            'success', true,
            'clientes', '[]'::JSONB
        );
    END IF;
    
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'nombre', c.nombre,
            'identificacion', c.identificacion,
            'telefono', c.telefono,
            'email', c.email
        )
    ) INTO v_resultados
    FROM clientes c
    WHERE c.identificacion ILIKE '%' || p_texto || '%'
       OR c.nombre ILIKE '%' || p_texto || '%'
       OR COALESCE(c.telefono, '') ILIKE '%' || p_texto || '%'
    ORDER BY c.nombre
    LIMIT 10;
    
    RETURN jsonb_build_object(
        'success', true,
        'clientes', COALESCE(v_resultados, '[]'::JSONB)
    );
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 9. Ejemplo de cómo usar las funciones
-- ==========================================

/*
-- Para crear una factura:
SELECT crear_factura_con_stock(
    'Juan Pérez',
    '1234567890',
    'juan@email.com',
    '3001234567',
    '[{"producto_id": 1, "cantidad": 2}, {"producto_id": 3, "cantidad": 1}]'::jsonb,
    'transferencia'
);

-- Para descontar stock manualmente:
SELECT descontar_stock(1, 5);

-- Para anular una factura (restaurará el stock):
SELECT anular_factura(1);

-- Para ver todas las facturas:
SELECT * FROM facturas ORDER BY fecha_creacion DESC;

-- Para ver el detalle de una factura:
SELECT * FROM detalle_facturas WHERE factura_id = 1;
*/
