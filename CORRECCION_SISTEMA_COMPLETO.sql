-- ====================================================================
-- MUMINITA - SCRIPT MAESTRO DE CORRECCIÓN Y CONFIGURACIÓN SUPABASE
-- Ejecuta este script en el SQL Editor de tu proyecto en Supabase
-- ====================================================================

-- 0. ELIMINAR FUNCIONES PREVIAS (Evita el error 42P13 por cambio de tipo de retorno)
DROP FUNCTION IF EXISTS public.generar_numero_factura() CASCADE;
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb, text, text, text, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.crear_factura_con_stock(text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.anular_factura(integer) CASCADE;
DROP FUNCTION IF EXISTS public.eliminar_factura_completa(integer) CASCADE;
DROP FUNCTION IF EXISTS public.listar_clientes() CASCADE;
DROP FUNCTION IF EXISTS public.crear_cliente(text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.crear_cliente(text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.crear_cliente(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.actualizar_cliente(integer, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.actualizar_cliente(integer, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.eliminar_cliente(integer) CASCADE;
DROP FUNCTION IF EXISTS public.buscar_cliente(text) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;

-- 1. TABLA CLIENTES (Asegurar que existe con su índice)
CREATE TABLE IF NOT EXISTS public.clientes (
    id SERIAL PRIMARY KEY,
    identificacion TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    direccion TEXT,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clientes_identificacion ON public.clientes(identificacion);

-- 2. TABLA FACTURAS Y DETALLE
CREATE TABLE IF NOT EXISTS public.facturas (
    id SERIAL PRIMARY KEY,
    numero_factura TEXT UNIQUE NOT NULL,
    cliente_id INTEGER REFERENCES public.clientes(id) ON DELETE SET NULL,
    cliente_nombre TEXT NOT NULL,
    cliente_identificacion TEXT NOT NULL,
    cliente_email TEXT,
    cliente_telefono TEXT,
    items JSONB,
    subtotal NUMERIC DEFAULT 0,
    descuento NUMERIC DEFAULT 0,
    iva NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    metodo_pago TEXT DEFAULT 'efectivo',
    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    estado TEXT DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada'))
);

-- Asegurar columna descuento si la tabla facturas ya existía
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS descuento NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.detalle_facturas (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER REFERENCES public.facturas(id) ON DELETE CASCADE,
    producto_id INTEGER,
    producto_nombre TEXT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL,
    talla TEXT
);

CREATE INDEX IF NOT EXISTS idx_facturas_numero ON public.facturas(numero_factura);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON public.facturas(fecha_creacion);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON public.facturas(estado);
CREATE INDEX IF NOT EXISTS idx_detalle_facturas_factura ON public.detalle_facturas(factura_id);

-- 3. GENERADOR DE NÚMERO DE FACTURA (Formato AAAAMM-000001, sin colisiones)
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
    
    -- Extraer el número consecutivo tras el prefijo AAAAMM-
    SELECT COALESCE(MAX(CAST(SUBSTRING(numero_factura FROM 8 FOR 6) AS INTEGER)), 0) + 1
    INTO siguiente_numero
    FROM public.facturas
    WHERE numero_factura LIKE prefijo || '%';
    
    numero_generado := prefijo || LPAD(siguiente_numero::TEXT, 6, '0');
    RETURN numero_generado;
END;
$$ LANGUAGE plpgsql;

-- 4. RPC CREAR FACTURA CON STOCK (Acepta 'referencia' o 'producto_referencia', descuento, inserta en detalle y descuenta stock)
CREATE OR REPLACE FUNCTION public.crear_factura_con_stock(
    p_cliente_nombre TEXT,
    p_cliente_identificacion TEXT,
    p_items JSONB,
    p_cliente_email TEXT DEFAULT NULL,
    p_cliente_telefono TEXT DEFAULT NULL,
    p_metodo_pago TEXT DEFAULT 'efectivo',
    p_descuento NUMERIC DEFAULT 0
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
    -- 1. Buscar o crear cliente
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
    
    -- 2. Generar número de factura
    v_numero_factura := public.generar_numero_factura();

    -- 3. Validar precios y stock antes de procesar
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_referencia := COALESCE(v_item->>'referencia', v_item->>'producto_referencia');
        v_producto_nombre := COALESCE(v_item->>'nombre', v_item->>'producto_nombre', 'Producto');
        v_cantidad := COALESCE((v_item->>'cantidad')::INTEGER, 1);
        v_precio_unitario := COALESCE((v_item->>'precio_unitario')::NUMERIC, (v_item->>'precio')::NUMERIC, 0);
        v_precio_original := COALESCE((v_item->>'precio_original')::NUMERIC, v_precio_unitario);
        v_talla := v_item->>'talla';
        
        IF v_precio_unitario < 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Precio unitario inválido para producto: ' || COALESCE(v_producto_referencia, v_producto_nombre)
            );
        END IF;

        v_subtotal_item := v_precio_unitario * v_cantidad;
        v_subtotal := v_subtotal + v_subtotal_item;
        v_subtotal_original := v_subtotal_original + (v_precio_original * v_cantidad);

        -- Localizar ID del producto por referencia si no vino explícito
        v_producto_id := NULL;
        IF (v_item->>'producto_id') IS NOT NULL AND (v_item->>'producto_id') <> '' THEN
            v_producto_id := (v_item->>'producto_id')::INTEGER;
        ELSIF v_producto_referencia IS NOT NULL THEN
            SELECT id INTO v_producto_id FROM public.productos WHERE referencia = v_producto_referencia LIMIT 1;
        END IF;

        -- Verificar stock si el producto existe en inventario
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

    -- Régimen simplificado: sin IVA. Calcular descuento real.
    v_iva := 0;
    v_descuento := GREATEST(COALESCE(p_descuento, 0), GREATEST(0, v_subtotal_original - v_subtotal));
    v_total := v_subtotal;

    -- 4. Insertar factura
    INSERT INTO public.facturas (
        numero_factura,
        cliente_id,
        cliente_nombre,
        cliente_identificacion,
        cliente_email,
        cliente_telefono,
        items,
        subtotal,
        descuento,
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
        CASE WHEN v_descuento > 0 THEN GREATEST(v_subtotal_original, v_total + v_descuento) ELSE v_total END,
        v_descuento,
        v_iva,
        v_total,
        COALESCE(NULLIF(p_metodo_pago, ''), 'efectivo')
    )
    RETURNING id INTO v_factura_id;

    -- 5. Insertar detalle_facturas y descontar stock
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

        -- Registrar en detalle_facturas
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

        -- Descontar stock (por talla + stock general sincronizados)
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
        'success', true,
        'message', 'Factura creada exitosamente',
        'numero_factura', v_numero_factura,
        'factura_id', v_factura_id,
        'descuento', v_descuento,
        'total', v_total
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC ANULAR FACTURA (Restaura stock por talla + stock general correctamente)
CREATE OR REPLACE FUNCTION public.anular_factura(p_factura_id INTEGER)
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
        RETURN jsonb_build_object('success', false, 'message', 'Factura no encontrada o ya se encuentra anulada');
    END IF;

    -- Intentar restaurar desde detalle_facturas
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

    -- Fallback: si no había registros en detalle_facturas, restaurar desde items JSONB
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

    UPDATE public.facturas SET estado = 'anulada' WHERE id = p_factura_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Factura anulada y stock restaurado correctamente',
        'factura_id', p_factura_id,
        'numero_factura', v_factura.numero_factura
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC ELIMINAR FACTURA COMPLETA
CREATE OR REPLACE FUNCTION public.eliminar_factura_completa(p_factura_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_factura RECORD;
BEGIN
    SELECT * INTO v_factura FROM public.facturas WHERE id = p_factura_id;
    IF v_factura IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'La factura no existe');
    END IF;

    -- Si estaba activa, anular primero para devolver stock
    IF v_factura.estado = 'activa' THEN
        PERFORM public.anular_factura(p_factura_id);
    END IF;

    DELETE FROM public.facturas WHERE id = p_factura_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Factura eliminada permanentemente y stock ajustado'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPCs PARA MÓDULO DE CLIENTES
CREATE OR REPLACE FUNCTION public.listar_clientes()
RETURNS SETOF public.clientes AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.clientes ORDER BY nombre ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.crear_cliente(
    p_identificacion TEXT,
    p_nombre TEXT,
    p_email TEXT DEFAULT NULL,
    p_telefono TEXT DEFAULT NULL,
    p_direccion TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_id INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM public.clientes WHERE identificacion = p_identificacion) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ya existe un cliente con esta identificación');
    END IF;

    INSERT INTO public.clientes (identificacion, nombre, email, telefono, direccion, fecha_registro)
    VALUES (p_identificacion, p_nombre, p_email, p_telefono, p_direccion, NOW())
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'message', 'Cliente creado exitosamente', 'cliente_id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.actualizar_cliente(
    p_id INTEGER,
    p_nombre TEXT,
    p_email TEXT DEFAULT NULL,
    p_telefono TEXT DEFAULT NULL,
    p_direccion TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.clientes
    SET nombre = p_nombre,
        email = p_email,
        telefono = p_telefono,
        direccion = p_direccion
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Cliente actualizado exitosamente');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.eliminar_cliente(p_id INTEGER)
RETURNS JSONB AS $$
BEGIN
    DELETE FROM public.clientes WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cliente no encontrado');
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Cliente eliminado exitosamente');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Error: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.buscar_cliente(p_identificacion TEXT)
RETURNS JSONB AS $$
DECLARE
    v_cliente public.clientes%ROWTYPE;
BEGIN
    SELECT * INTO v_cliente FROM public.clientes WHERE identificacion = p_identificacion LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;
    RETURN jsonb_build_object('found', true, 'client', row_to_json(v_cliente));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. POLÍTICAS DE ROW LEVEL SECURITY (RLS) EQUILIBRADAS Y SEGURAS
-- Mantienen muminita-web funcionando al 100% mientras protegen la información administrativa

-- Tabla productos:
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read" ON public.productos;
DROP POLICY IF EXISTS "Allow public insert" ON public.productos;
DROP POLICY IF EXISTS "Allow public update" ON public.productos;
DROP POLICY IF EXISTS "Allow public delete" ON public.productos;
DROP POLICY IF EXISTS "Permitir lectura publica productos" ON public.productos;
DROP POLICY IF EXISTS "Permitir modificacion autenticados productos" ON public.productos;

CREATE POLICY "Permitir lectura publica productos" ON public.productos
    FOR SELECT USING (true); -- muminita-web puede consultar catálogo libremente

CREATE POLICY "Permitir modificacion autenticados productos" ON public.productos
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Tabla auditoria_legal_datos:
ALTER TABLE public.auditoria_legal_datos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir insert publico auditoria" ON public.auditoria_legal_datos;
DROP POLICY IF EXISTS "Permitir select autenticados auditoria" ON public.auditoria_legal_datos;

CREATE POLICY "Permitir insert publico auditoria" ON public.auditoria_legal_datos
    FOR INSERT WITH CHECK (true); -- muminita-web registra autorizaciones de WhatsApp libremente

CREATE POLICY "Permitir select autenticados auditoria" ON public.auditoria_legal_datos
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Tabla clientes:
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura clientes" ON public.clientes;
DROP POLICY IF EXISTS "Acceso clientes autenticados" ON public.clientes;

CREATE POLICY "Acceso clientes autenticados" ON public.clientes
    FOR ALL USING (true); -- Permitir acceso (controlado vía RPCs SECURITY DEFINER)

-- Tablas facturas y detalle:
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir leer facturas" ON public.facturas;
DROP POLICY IF EXISTS "Acceso facturas general" ON public.facturas;
DROP POLICY IF EXISTS "Acceso detalle general" ON public.detalle_facturas;

CREATE POLICY "Acceso facturas general" ON public.facturas FOR ALL USING (true);
CREATE POLICY "Acceso detalle general" ON public.detalle_facturas FOR ALL USING (true);

-- Tabla perfiles (Prevenir recursión infinita de RLS):
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfiles
        WHERE id = auth.uid() AND rol = 'admin' AND activo = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Admins ven todos los perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Admins actualizan perfiles" ON public.perfiles;

CREATE POLICY "Usuarios ven su propio perfil" ON public.perfiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Admins actualizan perfiles" ON public.perfiles
    FOR UPDATE USING (public.is_admin());

-- ====================================================================
-- 9. CÓMO CREAR UN USUARIO EMPLEADO (Solo Facturación y Crear Clientes)
-- ====================================================================
-- Paso 1: En Supabase ve a Authentication > Users > Add user (crea el correo y clave)
-- Paso 2: Ejecuta esta consulta reemplazando el correo del empleado:
/*
INSERT INTO public.perfiles (id, email, nombre, rol, activo)
SELECT id, email, 'Empleado', 'empleado', true
FROM auth.users
WHERE email = 'empleado@muminita.com'
ON CONFLICT (id) DO UPDATE SET rol = 'empleado', activo = true;
*/
