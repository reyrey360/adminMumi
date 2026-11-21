-- ====================================================================
-- MUMINITA - ACTUALIZACIÓN SQL: VENDEDOR, MOTIVO ANULACIÓN Y REPORTES
-- Ejecuta este script en una nueva consulta (+ New query) en Supabase
-- ====================================================================

-- 1. Agregar columnas de trazabilidad a la tabla facturas
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS vendedor_email TEXT;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS anulado_por TEXT;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMP WITH TIME ZONE;

-- 2. Eliminar firmas previas para evitar conflictos de sobrecarga
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb, text, text, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb, text, text, text, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.anular_factura(integer, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.anular_factura(integer) CASCADE;

-- 3. RPC CREAR FACTURA CON STOCK + DESCUENTO + VENDEDOR
CREATE OR REPLACE FUNCTION public.crear_factura_con_stock(
    p_cliente_nombre TEXT,
    p_cliente_identificacion TEXT,
    p_items JSONB,
    p_cliente_email TEXT DEFAULT NULL,
    p_cliente_telefono TEXT DEFAULT NULL,
    p_metodo_pago TEXT DEFAULT 'efectivo',
    p_descuento NUMERIC DEFAULT 0,
    p_vendedor_email TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_factura_id INTEGER;
    v_numero_factura TEXT;
    v_subtotal NUMERIC := 0;
    v_subtotal_original NUMERIC := 0;
    v_descuento NUMERIC := 0;
    v_iva NUMERIC := 0;
    v_total NUMERIC := 0;
    v_item JSONB;
    v_producto_id INTEGER;
    v_producto_referencia TEXT;
    v_producto_nombre TEXT;
    v_cantidad INTEGER;
    v_precio_unitario NUMERIC;
    v_precio_original NUMERIC;
    v_talla TEXT;
    v_cliente_id INTEGER;
    v_stock_talla TEXT;
    v_subtotal_item NUMERIC;
    v_stock_actual INTEGER;
BEGIN
    SELECT id INTO v_cliente_id FROM public.clientes WHERE identificacion = p_cliente_identificacion;
    IF v_cliente_id IS NULL THEN
        INSERT INTO public.clientes (identificacion, nombre, email, telefono)
        VALUES (p_cliente_identificacion, p_cliente_nombre, p_cliente_email, p_cliente_telefono)
        RETURNING id INTO v_cliente_id;
    ELSE
        UPDATE public.clientes
        SET nombre = COALESCE(NULLIF(p_cliente_nombre, ''), nombre),
            email = COALESCE(NULLIF(p_cliente_email, ''), email),
            telefono = COALESCE(NULLIF(p_cliente_telefono, ''), telefono)
        WHERE id = v_cliente_id;
    END IF;

    v_numero_factura := public.generar_numero_factura();

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_referencia := COALESCE(v_item->>'referencia', v_item->>'producto_referencia');
        v_producto_nombre := COALESCE(v_item->>'nombre', v_item->>'producto_nombre', 'Producto');
        v_cantidad := COALESCE((v_item->>'cantidad')::INTEGER, 1);
        v_precio_unitario := COALESCE((v_item->>'precio_unitario')::NUMERIC, (v_item->>'precio')::NUMERIC, 0);
        v_precio_original := COALESCE((v_item->>'precio_original')::NUMERIC, v_precio_unitario);
        v_talla := v_item->>'talla';

        IF v_precio_unitario < 0 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Precio inválido para: ' || COALESCE(v_producto_referencia, v_producto_nombre));
        END IF;

        v_subtotal_item := v_precio_unitario * v_cantidad;
        v_subtotal := v_subtotal + v_subtotal_item;
        v_subtotal_original := v_subtotal_original + (v_precio_original * v_cantidad);

        v_producto_id := NULL;
        IF (v_item->>'producto_id') IS NOT NULL AND (v_item->>'producto_id') <> '' THEN
            v_producto_id := (v_item->>'producto_id')::INTEGER;
        ELSIF v_producto_referencia IS NOT NULL THEN
            SELECT id INTO v_producto_id FROM public.productos WHERE TRIM(referencia) = TRIM(v_producto_referencia) LIMIT 1;
        END IF;

        IF v_producto_id IS NOT NULL THEN
            IF v_talla IS NOT NULL AND TRIM(v_talla) <> '' THEN
                v_stock_talla := 'stock_' || LOWER(REPLACE(TRIM(v_talla), '-', '_'));
                BEGIN
                    EXECUTE format('SELECT %I FROM public.productos WHERE id = $1', v_stock_talla)
                        INTO v_stock_actual USING v_producto_id;
                EXCEPTION WHEN OTHERS THEN
                    SELECT stock INTO v_stock_actual FROM public.productos WHERE id = v_producto_id;
                END;
            ELSE
                SELECT stock INTO v_stock_actual FROM public.productos WHERE id = v_producto_id;
            END IF;

            v_stock_actual := COALESCE(v_stock_actual, 0);
            IF v_stock_actual < v_cantidad THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'message', 'Stock insuficiente para ' || COALESCE(v_producto_referencia, v_producto_nombre) ||
                              COALESCE(' (Talla: ' || v_talla || ')', '') ||
                              '. Stock actual: ' || v_stock_actual || ', solicitado: ' || v_cantidad
                );
            END IF;
        END IF;
    END LOOP;

    v_iva := 0;
    v_descuento := GREATEST(COALESCE(p_descuento, 0), GREATEST(0, v_subtotal_original - v_subtotal));
    v_total := v_subtotal;

    INSERT INTO public.facturas (
        numero_factura, cliente_id, cliente_nombre, cliente_identificacion,
        cliente_email, cliente_telefono, items, subtotal, descuento, iva, total,
        metodo_pago, vendedor_email
    ) VALUES (
        v_numero_factura, v_cliente_id, p_cliente_nombre, p_cliente_identificacion,
        p_cliente_email, p_cliente_telefono, p_items,
        CASE WHEN v_descuento > 0 THEN GREATEST(v_subtotal_original, v_total + v_descuento) ELSE v_total END,
        v_descuento, v_iva, v_total, COALESCE(NULLIF(p_metodo_pago, ''), 'efectivo'),
        NULLIF(p_vendedor_email, '')
    )
    RETURNING id INTO v_factura_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_referencia := COALESCE(v_item->>'referencia', v_item->>'producto_referencia');
        v_producto_nombre := COALESCE(v_item->>'nombre', v_item->>'producto_nombre', 'Producto');
        v_cantidad := COALESCE((v_item->>'cantidad')::INTEGER, 1);
        v_precio_unitario := COALESCE((v_item->>'precio_unitario')::NUMERIC, (v_item->>'precio')::NUMERIC, 0);
        v_talla := v_item->>'talla';

        v_producto_id := NULL;
        IF (v_item->>'producto_id') IS NOT NULL AND (v_item->>'producto_id') <> '' THEN
            v_producto_id := (v_item->>'producto_id')::INTEGER;
        ELSIF v_producto_referencia IS NOT NULL THEN
            SELECT id INTO v_producto_id FROM public.productos WHERE TRIM(referencia) = TRIM(v_producto_referencia) LIMIT 1;
        END IF;

        INSERT INTO public.detalle_facturas (
            factura_id, producto_id, producto_nombre, cantidad, precio_unitario, subtotal, talla
        ) VALUES (
            v_factura_id, v_producto_id, v_producto_nombre, v_cantidad, v_precio_unitario, (v_precio_unitario * v_cantidad), v_talla
        );

        IF v_producto_id IS NOT NULL THEN
            IF v_talla IS NOT NULL AND TRIM(v_talla) <> '' THEN
                v_stock_talla := 'stock_' || LOWER(REPLACE(TRIM(v_talla), '-', '_'));
                BEGIN
                    EXECUTE format(
                        'UPDATE public.productos SET %I = GREATEST(0, COALESCE(%I, 0) - $1), stock = GREATEST(0, COALESCE(stock, 0) - $1), updated_at = NOW() WHERE id = $2',
                        v_stock_talla, v_stock_talla
                    ) USING v_cantidad, v_producto_id;
                EXCEPTION WHEN OTHERS THEN
                    UPDATE public.productos SET stock = GREATEST(0, COALESCE(stock, 0) - v_cantidad), updated_at = NOW() WHERE id = v_producto_id;
                END;
            ELSE
                UPDATE public.productos SET stock = GREATEST(0, COALESCE(stock, 0) - v_cantidad), updated_at = NOW() WHERE id = v_producto_id;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 'message', 'Factura creada exitosamente',
        'numero_factura', v_numero_factura, 'factura_id', v_factura_id,
        'descuento', v_descuento, 'total', v_total
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC ANULAR FACTURA CON MOTIVO OBLIGATORIO Y TRAZABILIDAD
CREATE OR REPLACE FUNCTION public.anular_factura(
    p_factura_id INTEGER,
    p_motivo TEXT DEFAULT NULL,
    p_anulado_por TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_factura RECORD;
    v_detalle RECORD;
    v_item JSONB;
    v_producto_id INTEGER;
    v_cantidad INTEGER;
    v_talla TEXT;
    v_stock_talla TEXT;
    v_tiene_detalle BOOLEAN := false;
BEGIN
    SELECT * INTO v_factura FROM public.facturas WHERE id = p_factura_id AND estado = 'activa';
    IF v_factura IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Factura no encontrada o ya está anulada');
    END IF;

    FOR v_detalle IN SELECT * FROM public.detalle_facturas WHERE factura_id = p_factura_id
    LOOP
        v_tiene_detalle := true;
        IF v_detalle.producto_id IS NOT NULL THEN
            IF v_detalle.talla IS NOT NULL AND TRIM(v_detalle.talla) <> '' THEN
                v_stock_talla := 'stock_' || LOWER(REPLACE(TRIM(v_detalle.talla), '-', '_'));
                BEGIN
                    EXECUTE format(
                        'UPDATE public.productos SET %I = COALESCE(%I, 0) + $1, stock = COALESCE(stock, 0) + $1, updated_at = NOW() WHERE id = $2',
                        v_stock_talla, v_stock_talla
                    ) USING v_detalle.cantidad, v_detalle.producto_id;
                EXCEPTION WHEN OTHERS THEN
                    UPDATE public.productos SET stock = COALESCE(stock, 0) + v_detalle.cantidad, updated_at = NOW() WHERE id = v_detalle.producto_id;
                END;
            ELSE
                UPDATE public.productos SET stock = COALESCE(stock, 0) + v_detalle.cantidad, updated_at = NOW() WHERE id = v_detalle.producto_id;
            END IF;
        END IF;
    END LOOP;

    IF NOT v_tiene_detalle AND v_factura.items IS NOT NULL THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_factura.items)
        LOOP
            v_cantidad := COALESCE((v_item->>'cantidad')::INTEGER, 1);
            v_talla := v_item->>'talla';
            v_producto_id := NULL;
            IF (v_item->>'producto_id') IS NOT NULL AND (v_item->>'producto_id') <> '' THEN
                v_producto_id := (v_item->>'producto_id')::INTEGER;
            ELSE
                SELECT id INTO v_producto_id FROM public.productos
                WHERE TRIM(referencia) = TRIM(COALESCE(v_item->>'referencia', v_item->>'producto_referencia')) LIMIT 1;
            END IF;

            IF v_producto_id IS NOT NULL THEN
                IF v_talla IS NOT NULL AND TRIM(v_talla) <> '' THEN
                    v_stock_talla := 'stock_' || LOWER(REPLACE(TRIM(v_talla), '-', '_'));
                    BEGIN
                        EXECUTE format(
                            'UPDATE public.productos SET %I = COALESCE(%I, 0) + $1, stock = COALESCE(stock, 0) + $1, updated_at = NOW() WHERE id = $2',
                            v_stock_talla, v_stock_talla
                        ) USING v_cantidad, v_producto_id;
                    EXCEPTION WHEN OTHERS THEN
                        UPDATE public.productos SET stock = COALESCE(stock, 0) + v_cantidad, updated_at = NOW() WHERE id = v_producto_id;
                    END;
                ELSE
                    UPDATE public.productos SET stock = COALESCE(stock, 0) + v_cantidad, updated_at = NOW() WHERE id = v_producto_id;
                END IF;
            END IF;
        END LOOP;
    END IF;

    UPDATE public.facturas
    SET estado = 'anulada',
        motivo_anulacion = COALESCE(NULLIF(TRIM(p_motivo), ''), 'Sin motivo especificado'),
        anulado_por = NULLIF(TRIM(p_anulado_por), ''),
        fecha_anulacion = NOW()
    WHERE id = p_factura_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Factura anulada y stock restaurado correctamente',
        'factura_id', p_factura_id,
        'numero_factura', v_factura.numero_factura
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

