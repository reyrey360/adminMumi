-- ==========================================
-- CORRECCIÓN: RPC crear_factura_con_stock, anular_factura y helpers
-- Ejecutar en el Editor SQL de Supabase
-- (O ejecuta CORRECCION_SISTEMA_COMPLETO.sql para aplicar todo)
-- ==========================================

DROP FUNCTION IF EXISTS public.generar_numero_factura() CASCADE;
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.anular_factura(integer) CASCADE;
DROP FUNCTION IF EXISTS public.eliminar_factura_completa(integer) CASCADE;

-- Asegurar generador de factura sin colisión
CREATE OR REPLACE FUNCTION public.generar_numero_factura()
RETURNS TEXT AS $$
DECLARE
    siguiente_numero INTEGER;
    anno TEXT;
    mes TEXT;
    prefijo TEXT;
    numero_generado TEXT;
BEGIN
    anno := TO_CHAR(NOW(), 'YYYY');
    mes := TO_CHAR(NOW(), 'MM');
    prefijo := anno || mes || '-';
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_factura FROM 8 FOR 6) AS INTEGER)), 0) + 1
    INTO siguiente_numero
    FROM public.facturas
    WHERE numero_factura LIKE prefijo || '%';
    
    numero_generado := prefijo || LPAD(siguiente_numero::TEXT, 6, '0');
    RETURN numero_generado;
END;
$$ LANGUAGE plpgsql;

-- Función crear_factura_con_stock robusta
CREATE OR REPLACE FUNCTION public.crear_factura_con_stock(
    p_cliente_nombre TEXT,
    p_cliente_identificacion TEXT,
    p_items JSONB,
    p_cliente_email TEXT DEFAULT NULL,
    p_cliente_telefono TEXT DEFAULT NULL,
    p_metodo_pago TEXT DEFAULT 'efectivo'
)
RETURNS JSONB AS $$
DECLARE
    v_factura_id INTEGER;
    v_numero_factura TEXT;
    v_subtotal NUMERIC := 0;
    v_iva NUMERIC := 0;
    v_total NUMERIC := 0;
    v_item JSONB;
    v_producto_id INTEGER;
    v_producto_referencia TEXT;
    v_producto_nombre TEXT;
    v_cantidad INTEGER;
    v_precio_unitario NUMERIC;
    v_talla TEXT;
    v_cliente_id INTEGER;
    v_stock_talla TEXT;
    v_subtotal_item NUMERIC;
    v_stock_actual INTEGER;
BEGIN
    -- 1. Buscar o registrar cliente
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
    
    -- 2. Generar consecutivo
    v_numero_factura := public.generar_numero_factura();

    -- 3. Validar precios e inventario
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_referencia := COALESCE(v_item->>'referencia', v_item->>'producto_referencia');
        v_producto_nombre := COALESCE(v_item->>'nombre', v_item->>'producto_nombre', 'Producto');
        v_cantidad := COALESCE((v_item->>'cantidad')::INTEGER, 1);
        v_precio_unitario := COALESCE((v_item->>'precio_unitario')::NUMERIC, (v_item->>'precio')::NUMERIC, 0);
        v_talla := v_item->>'talla';
        
        IF v_precio_unitario <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Precio unitario inválido para producto: ' || COALESCE(v_producto_referencia, v_producto_nombre)
            );
        END IF;

        v_subtotal_item := v_precio_unitario * v_cantidad;
        v_subtotal := v_subtotal + v_subtotal_item;

        v_producto_id := NULL;
        IF (v_item->>'producto_id') IS NOT NULL AND (v_item->>'producto_id') <> '' THEN
            v_producto_id := (v_item->>'producto_id')::INTEGER;
        ELSIF v_producto_referencia IS NOT NULL THEN
            SELECT id INTO v_producto_id FROM public.productos WHERE referencia = v_producto_referencia LIMIT 1;
        END IF;

        IF v_producto_id IS NOT NULL THEN
            IF v_talla IS NOT NULL AND TRIM(v_talla) <> '' THEN
                v_stock_talla := 'stock_' || LOWER(REPLACE(TRIM(v_talla), '-', '_'));
                BEGIN
                    EXECUTE format('SELECT %I FROM public.productos WHERE id = $1', v_stock_talla)
                        INTO v_stock_actual
                        USING v_producto_id;
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
    v_total := v_subtotal;

    -- 4. Guardar factura
    INSERT INTO public.facturas (
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
        COALESCE(NULLIF(p_metodo_pago, ''), 'efectivo')
    )
    RETURNING id INTO v_factura_id;

    -- 5. Guardar detalle_facturas y descontar stock
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
            SELECT id INTO v_producto_id FROM public.productos WHERE referencia = v_producto_referencia LIMIT 1;
        END IF;

        INSERT INTO public.detalle_facturas (
            factura_id,
            producto_id,
            producto_nombre,
            cantidad,
            precio_unitario,
            subtotal,
            talla
        ) VALUES (
            v_factura_id,
            v_producto_id,
            v_producto_nombre,
            v_cantidad,
            v_precio_unitario,
            (v_precio_unitario * v_cantidad),
            v_talla
        );

        IF v_producto_id IS NOT NULL THEN
            IF v_talla IS NOT NULL AND TRIM(v_talla) <> '' THEN
                v_stock_talla := 'stock_' || LOWER(REPLACE(TRIM(v_talla), '-', '_'));
                BEGIN
                    EXECUTE format('UPDATE public.productos SET %I = GREATEST(0, %I - $1), updated_at = NOW() WHERE id = $2', 
                        v_stock_talla, v_stock_talla)
                        USING v_cantidad, v_producto_id;
                EXCEPTION WHEN OTHERS THEN
                    UPDATE public.productos SET stock = GREATEST(0, stock - v_cantidad), updated_at = NOW() WHERE id = v_producto_id;
                END;
            ELSE
                UPDATE public.productos SET stock = GREATEST(0, stock - v_cantidad), updated_at = NOW() WHERE id = v_producto_id;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Factura creada exitosamente',
        'numero_factura', v_numero_factura,
        'factura_id', v_factura_id,
        'total', v_total
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
