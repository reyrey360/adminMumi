-- ==========================================
-- CREAR TABLA DE USUARIOS Y ROLES
-- ==========================================
-- Copia y ejecuta este SQL en el SQL Editor de Supabase

-- 1. Crear tabla de perfiles de usuario (se relaciona con auth.users)
CREATE TABLE public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre TEXT,
    rol TEXT NOT NULL DEFAULT 'operario', -- 'admin' o 'operario'
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Row Level Security en la tabla de perfiles
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- 3. Crear política para que usuarios lean su propio perfil
CREATE POLICY "Usuarios ven su propio perfil" ON public.perfiles
    FOR SELECT USING (auth.uid() = id);

-- 4. Crear política para que solo admins puedan ver todos los perfiles
CREATE POLICY "Admins ven todos los perfiles" ON public.perfiles
    FOR SELECT USING (
        id IN (SELECT id FROM public.perfiles WHERE rol = 'admin' AND id = auth.uid())
    );

-- 5. Crear política para que admins puedan actualizar perfiles
CREATE POLICY "Admins actualizan perfiles" ON public.perfiles
    FOR UPDATE USING (
        id IN (SELECT id FROM public.perfiles WHERE rol = 'admin' AND id = auth.uid())
    );

-- 6. Crear función para crear perfil automáticamente cuando se registra un usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfiles (id, email, nombre, rol)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'nombre',
        COALESCE(NEW.raw_user_meta_data->>'rol', 'operario')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Crear trigger para ejecutar la función cuando se crea un usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- EJEMPLO: Insertar un usuario admin manualmente
-- ==========================================
-- Primero necesitas crear el usuario en Authentication > Users de Supabase
-- Luego ejecuta este SQL (reemplaza el ID del usuario):
/*
INSERT INTO public.perfiles (id, email, nombre, rol)
VALUES 
    ('ID_DEL_USUARIO_ADMIN', 'admin@muminita.com', 'Administrador', 'admin'),
    ('ID_DEL_USUARIO_OPERARIO', 'operario@muminita.com', 'Operario', 'operario');
*/

-- ==========================================
-- CONSULTAR USUARIOS CREADOS
-- ==========================================
SELECT * FROM public.perfiles;