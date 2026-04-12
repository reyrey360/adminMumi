-- ==========================================
-- CORRECCIÓN: RPC crear_factura_con_stock
-- Actualizado para aceptar producto_referencia
-- Ejecutar en el Editor SQL de Supabase
-- ==========================================

CREATE OR REPLACE FUNCTION crear_factura_con_stock(
    p_cliente_nombre TEXT,
    p_cliente_identificacion TEXT,
    p_cliente_email TEXT DEFAULT NULL,
    p_cliente_telefono TEXT DEFAULT NULL,
    p_items JSONB, -- Array de objetos: [{"producto_referencia": "R1", "producto_nombre": "Vestido", "cantidad": 2, "precio_unitario": 85000, "talla": "10"}, ...]
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
    -- Buscar o crear cliente
    SELECT id INTO v_cliente_id FROM clientes WHERE identificacion = p_cliente_identificacion;
    
    IF v_cliente_id IS NULL THEN
        INSERT INTO clientes (identificacion, nombre, email, telefono)
        VALUES (p_cliente_identificacion, p_cliente_nombre, p_cliente_email, p_cliente_telefono)
        RETURNING id INTO v_cliente_id;
    ELSE
        UPDATE clientes 
        SET nombre = COALESCE(p_cliente_nombre, nombre),
            email = COALESCE(p_cliente_email, email),
            telefono = COALESCE(p_cliente_telefono, telefono)
        WHERE id = v_cliente_id;
    END IF;
    
    -- Generar número de factura
    v_numero_factura := generar_numero_factura();

    -- Calcular subtotal validando que los datos vengan del cliente
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_referencia := v_item->>'producto_referencia';
        v_producto_nombre := v_item->>'producto_nombre';
        v_cantidad := (v_item->>'cantidad')::INTEGER;
        v_precio_unitario := (v_item->>'precio_unitario')::NUMERIC;
        v_talla := v_item->>'talla';
        
        -- Obtener product ID si existe por referencia
        SELECT id INTO v_producto_id FROM productos WHERE referencia = v_producto_referencia LIMIT 1;
        
        -- Si NO encontró en BD, usar los datos enviados del cliente (más importante es tener el registro)
        IF v_precio_unitario IS NULL OR v_precio_unitario = 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Precio unitario inválido para producto: ' || v_producto_referencia
            );
        END IF;

        -- Calcular subtotal del item
        v_subtotal_item := v_precio_unitario * v_cantidad;
        v_subtotal := v_subtotal + v_subtotal_item;

        -- Verificar stock SOLO si el producto existe en BD
        IF v_producto_id IS NOT NULL THEN
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
                    'message', 'Stock insuficiente para ' || v_producto_referencia || 
                              COALESCE(' (Talla: ' || v_talla || ')', '') ||
                              '. Stock: ' || v_stock_actual || ', solicitado: ' || v_cantidad
                );
            END IF;
        END IF;
    END LOOP;

    -- Régimen simplificado - No aplica IVA
    v_iva := 0;
    v_total := v_subtotal;

    -- Insertar la factura con todos los datos de items
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
        p_items,  -- Guardar los items completos con todos los datos
        v_subtotal,
        v_iva,
        v_total,
        p_metodo_pago
    )
    RETURNING id INTO v_factura_id;

    -- Descontar stock si existe en BD
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_referencia := v_item->>'producto_referencia';
        v_cantidad := (v_item->>'cantidad')::INTEGER;
        v_talla := v_item->>'talla';
        
        -- Obtener product ID
        SELECT id INTO v_producto_id FROM productos WHERE referencia = v_producto_referencia LIMIT 1;
        
        IF v_producto_id IS NOT NULL THEN
            IF v_talla IS NOT NULL AND v_talla <> '' THEN
                v_stock_talla := 'stock_' || LOWER(REPLACE(v_talla, '-', '_'));
                EXECUTE format('UPDATE productos SET %s = %s - $1, updated_at = NOW() WHERE id = $2', 
                    v_stock_talla, v_stock_talla)
                    USING v_cantidad, v_producto_id;
            ELSE
                UPDATE productos SET stock = stock - v_cantidad, updated_at = NOW() 
                WHERE id = v_producto_id;
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
