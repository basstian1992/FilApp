-- Script de inicialización de Base de Datos para FilApp (Supabase / PostgreSQL)

-- 1. Tabla de Usuarios (Pacientes/Clientes)
CREATE TABLE public.usuarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rut VARCHAR(12) UNIQUE NOT NULL,
    nombre VARCHAR(255),
    telefono VARCHAR(20),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabla de Especialistas (Staff)
CREATE TABLE public.especialistas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- Vinculado a Supabase Auth
    nombre VARCHAR(255) NOT NULL,
    cargo VARCHAR(255),
    letra_atencion VARCHAR(5) NOT NULL UNIQUE, -- Ej: 'A', 'B'
    competencias TEXT[],
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabla de Turnos (Tickets)
CREATE TYPE public.estado_turno AS ENUM ('espera', 'llamado', 'atendido', 'saltado');

CREATE TABLE public.turnos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    numero SERIAL, -- Número correlativo de atención
    rut_usuario VARCHAR(12) REFERENCES public.usuarios(rut),
    especialista_id UUID REFERENCES public.especialistas(id), -- Nullable hasta que se llame
    estado estado_turno DEFAULT 'espera'::public.estado_turno,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    called_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar Realtime para la tabla Turnos (Esencial para la TV)
alter publication supabase_realtime add table public.turnos;

-- 4. Tabla de Configuración Global
CREATE TABLE public.configuracion (
    id INT PRIMARY KEY DEFAULT 1,
    nombre_institucion VARCHAR(255) DEFAULT 'Mi Institución',
    mensaje_dia TEXT DEFAULT 'Bienvenidos a nuestro centro de atención',
    horario_inicio TIME,
    horario_fin TIME
);

-- Insertar configuración por defecto
INSERT INTO public.configuracion (id, nombre_institucion, mensaje_dia) VALUES (1, 'FilApp Center', 'Bienvenido. Por favor tome su turno en el Tótem.');

-- Políticas RLS (Row Level Security) - Simplificadas para desarrollo inicial
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.especialistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;

-- Políticas de inserción/lectura pública para el Tótem y la TV
CREATE POLICY "Permitir lectura pública de configuracion" ON public.configuracion FOR SELECT USING (true);
CREATE POLICY "Permitir inserción pública de usuarios" ON public.usuarios FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir lectura pública de usuarios" ON public.usuarios FOR SELECT USING (true);
CREATE POLICY "Permitir lectura pública de especialistas" ON public.especialistas FOR SELECT USING (true);

CREATE POLICY "Permitir inserción de turnos" ON public.turnos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir lectura de turnos" ON public.turnos FOR SELECT USING (true);
CREATE POLICY "Permitir actualización de turnos" ON public.turnos FOR UPDATE USING (true); -- Idealmente restringir a Auth en producción

-- ═══════════════════════════════════════════════════════════════════════════
-- MODELO MULTI-DEPENDENCIA (Firestore)
-- Cada institución (ej: municipio) puede tener varias dependencias físicas
-- (sedes). Cada sede tiene sus propios departamentos, su propio contador de
-- tickets (currentTurno / ultimo_reinicio viven en el doc de la sede) y una
-- TV y un Tótem independientes vía URLs:
--   /tv?institution={id}&sede={sedeId}
--   /totem?institution={id}&sede={sedeId}
--
-- Colección `sedes`:
--   institution_id  → id de la institución dueña
--   nombre          → "Casa Consistorial", "CESFAM Norte", etc.
--   direccion       → opcional
--   departamentos   → string[] departamentos/oficinas de esta dependencia
--   currentTurno    → contador de tickets independiente por dependencia
--   ultimo_reinicio → reset diario independiente por dependencia
--   created_at
--
-- Campos nuevos relacionados:
--   turnos.sede_id         → dependencia que emitió el ticket (null = central)
--   especialistas.sede_id  → dependencia donde atiende el funcionario
--
-- Colección `usuarios` (NO se segmenta por dependencia):
--   La base de usuarios es ESTANDARIZADA a nivel de institución: la clave del
--   documento es el RUT y cada doc se etiqueta con institution_id (nunca con
--   sede_id). Así todas las dependencias comparten la misma base segura y un
--   ciudadano registrado en cualquier sede existe para las demás.
--   Reglas: solo clientes autenticados; el Tótem/TV (públicos) consultan y
--   dan de alta RUTs vía /api/usuarios usando credenciales de administrador.
--
-- Retrocompatible: instituciones sin documentos en `sedes` funcionan igual
-- que antes (contador y URLs a nivel de institución).
-- ═══════════════════════════════════════════════════════════════════════════
