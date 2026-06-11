# Ficha Técnica — FilApp OS

## Sistema Multi-Institución de Gestión de Filas

---

## 1. Resumen del Sistema

**FilApp OS** es una aplicación web progresiva (PWA-ready) para la gestión integral de filas de atención al público. Opera con arquitectura multi-inquilino (multi-tenant), permitiendo que múltiples instituciones independientes utilicen la misma plataforma con datos aislados.

| Atributo | Valor |
|----------|-------|
| **Nombre** | FilApp OS |
| **Versión** | 2.0.0 |
| **Propósito** | Gestión de turnos, filas y atención de usuarios |
| **Arquitectura** | Multi-inquilino (Multi-tenant) |
| **Público objetivo** | Municipios, CESFAM, servicios públicos, atención ciudadana |
| **Idioma** | Español (Chile) |

---

## 2. Stack Tecnológico

### Frontend

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Next.js** | 16.2.6 | Framework React con App Router |
| **React** | 19.2.4 | Biblioteca UI |
| **TypeScript** | ^5 | Tipado estático |
| **next-themes** | 0.4.6 | Tema oscuro/claro |
| **lucide-react** | 1.17.0 | Iconografía |
| **CSS Modules** | — | Estilos encapsulados por componente |

### Backend & Base de Datos

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Firebase Auth** | — | Autenticación de usuarios |
| **Firebase Firestore** | — | Base de datos NoSQL en tiempo real |
| **Firebase Storage** | — | Almacenamiento (no implementado aún) |

### Tiempo Real

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Firestore onSnapshot** | — | Sincronización en tiempo real (principal) |
| **Socket.IO** | 4.8.3 (server + client) | Notificaciones de citas agendadas |
| **server.js** | — | Servidor HTTP personalizado con Socket.IO |

### APIs Externas

| API | Propósito |
|-----|-----------|
| **CallMeBot API** | Notificaciones WhatsApp |
| **Web Speech API** | Síntesis de voz para pantalla TV |
| **n8n Webhook** | Integración con automatizaciones externas |

### Herramientas de Desarrollo

| Herramienta | Versión | Propósito |
|-------------|---------|-----------|
| **ESLint** | ^9 | Linting con eslint-config-next |
| **Turbopack** | — | Bundler (Next.js 16) |
| **Node.js** | ≥18 | Entorno de ejecución |

---

## 3. Modelo de Datos (Firestore)

### Colección: `institutions`

```
{
  id: string (auto)
  name: string
  owner_id: string (ref: especialistas)
  owner_email: string
  created_at: string (ISO date)
  currentTurno: number
  estado: "activa" | "pendiente"
  ultimo_reinicio: string (ISO date) | null
  reset_logs: [{ nombre: string, fecha: string }]
  config: {
    tv_name: string
    logo_url: string
    tv_primary_color: string (hex)
    tv_background_url: string
    mensaje_dia: string
    departamentos: string[]
    oirs_departamento: string
    n8n_webhook_url: string
  }
}
```

### Colección: `especialistas`

```
{
  id: string (auto o igual a user_id)
  user_id: string (ref: Firebase Auth UID)
  institution_id: string (ref: institutions) | ""
  role: "gerente" | "admin" | "funcionario"
  nombre: string
  departamento: string
  cargo: string
  estado_funcionario: "activo" | "inactivo" | "pendiente" | "atendiendo"
  avatar_url: string
  letra_atencion: string
  email: string
  whatsapp_phone: string
  whatsapp_apikey: string
}
```

### Colección: `turnos`

```
{
  id: string (auto)
  institution_id: string (ref: institutions)
  numero: number
  letra_ticket: string
  departamento_solicitado: string
  rut_usuario: string
  estado: "espera" | "llamado" | "atendido" | "saltado"
  created_at: string (ISO date)
  called_at: string (ISO date)
  finished_at: string (ISO date)
  especialista_id: string (ref: especialistas)
  nombre_funcionario: string
  departamento: string
  letra_especialista: string
  priority: boolean
  is_appointment: boolean
  funcionario_id: string | null
  funcionario_nombre: string | null
}
```

### Colección: `usuarios`

```
{
  id: string (RUT del paciente)
  rut: string
  institution_id: string
  nombre: string
  created_at: string (ISO date)
  // Campos adicionales según formulario UserForm:
  fecha_nacimiento, direccion, telefono, email_personal,
  region, provincia, comuna, y otros datos sociales
}
```

---

## 4. Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                     Cliente (Browser)                        │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Landing  │ │  Admin   │ │Funcionar.│ │ TV / Totem    │  │
│  │  Page    │ │  Panel   │ │  Panel   │ │ / Central     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬───────┘  │
│       │            │            │               │          │
│       └────────────┴────────────┴───────────────┘          │
│                        │                                    │
│              ┌─────────┴─────────┐                         │
│              │   Firebase SDK    │                          │
│              │ (Auth + Firestore)│                          │
│              └─────────┬─────────┘                         │
│                        │                                    │
│              ┌─────────┴─────────┐                         │
│              │   Socket.IO Client │                         │
│              └───────────────────┘                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
┌─────────▼─────┐ ┌───────▼───────┐ ┌───▼────────────┐
│   Firebase    │ │   Socket.IO   │ │  CallMeBot     │
│   Auth +      │ │   Server      │ │  WhatsApp API  │
│   Firestore   │ │  (server.js)  │ │                │
└───────────────┘ └───────────────┘ └────────────────┘
```

### Flujo de Datos

1. **Autenticación**: Firebase Auth con email/contraseña.
2. **Datos en tiempo real**: Firestore `onSnapshot()` para cola, TV, stats.
3. **Notificaciones**: Socket.IO para eventos de citas agendadas.
4. **Webhooks**: POST a n8n para automatizaciones externas.
5. **WhatsApp**: Llamada fetch a CallMeBot API (no-cors).
6. **Voz TV**: Web Speech API del navegador (gratuito, voces neurales).

---

## 5. Sistema de Roles y Permisos

| Recurso / Acción | Gerente | Admin | Funcionario | Central | Público |
|-----------------|---------|-------|-------------|---------|---------|
| Ver todas las instituciones | ✅ | ❌ | ❌ | ❌ | ❌ |
| Crear institución | ✅ | ✅ (propia) | ❌ | ❌ | ❌ (via /register) |
| Autorizar institución | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurar institución | ✅ | ✅ | ❌ | ❌ | ❌ |
| CRUD funcionarios | ✅ | ✅ | ❌ | ❌ | ❌ |
| Atender turnos | ❌ | ❌ | ✅ | ❌ | ❌ |
| Generar turno manual | ❌ | ❌ | ✅ | ✅ | ❌ |
| Ver TV (sala espera) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Usar Tótem | ✅ | ✅ | ✅ | ✅ | ✅ |
| Registrar institución | ❌ | ❌ | ❌ | ❌ | ✅ |

### Tipos de Estado de Funcionario

| Estado | Significado |
|--------|-------------|
| `activo` | Disponible para atender |
| `inactivo` | No disponible (desconectado) |
| `pendiente` | Pendiente de autorización |
| `atendiendo` | Actualmente atendiendo un paciente |

---

## 6. Lógica de Negocio Crítica

### Conteo de Turnos

- Cada institución tiene un contador `currentTurno` en Firestore.
- El contador se incrementa atómicamente usando `runTransaction`.
- **Reset automático**: a las 07:00 AM hora Chile (America/Santiago).
- El reset se verifica comparando `ultimo_reinicio` con la fecha actual.
- **Reset manual**: disponible para admin y funcionarios (con registro de auditoría).

### Prioridad de Turnos

- Tickets de "Hora Agendada" tienen `priority: true`.
- En la cola del funcionario, los turnos se ordenan:
  1. Mayor `priority_level` primero.
  2. Por orden de llegada (`created_at` ascendente).

### Validación de RUT Chileno

- Implementación del algoritmo del módulo 11.
- Formato esperado: `12345678-9` (8 dígitos + guión + DV).
- Si el DV no coincide, **se muestra advertencia informativa pero no bloquea**.
- Permite documentos extranjeros sin problema.

---

## 7. Pantalla TV — Motor de Voz Premium

### Selección de Voces (Prioridad)

1. **Microsoft Sabina** (Español, neural)
2. **Microsoft Helena** (Español, neural)
3. **Microsoft Carolina** (Español Latinoamérica, neural)
4. **Microsoft Dalia / Pablo / Raul** (Español, neural)
5. **Google Español** (Chrome)
6. **Natural / Premium / Online** (genéricos)
7. Cualquier voz española latinoamericana (`es-CL`, `es-MX`, etc.)
8. Cualquier voz española disponible

### Parámetros de Voz

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `rate` | 0.85–0.95 | Velocidad adaptativa según longitud del texto |
| `pitch` | 1.0 | Tono neutro |
| `volume` | 1.0 | Volumen máximo |

### Anti-GC Chrome

Se asigna la utterance a `window.__filapp_utterance` para prevenir que el garbage collector de Chrome elimine el objeto antes de hablar.

### Secuencia de Anuncio

1. Suena "ding" (`/ding.mp3`).
2. Espera 800ms.
3. Sintetiza voz con el texto: *"Siguiente turno, letra X, número Y. Dirigirse al módulo Z."*

---

## 8. Seguridad

### Firebase Auth

- Autenticación por email/contraseña.
- Creación secundaria de usuarios desde Admin mediante `createUserWithEmailAndPassword` en una instancia separada de Firebase (`filapp-secondary`).

### Variables de Entorno

Las credenciales de Firebase se cargan desde variables de entorno:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### Hardening

- Las rutas protegidas redirigen a `/` si no hay sesión.
- Roles bloqueados: admin/gerente no pueden acceder a panel funcionario y viceversa.
- `estado_funcionario: "pendiente"` bloquea el acceso.
- Socket.IO con CORS abierto (`origin: *`) — para entorno controlado.

---

## 9. Despliegue

### Requisitos

- Node.js ≥ 18
- npm ≥ 9

### Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo Next.js |
| `npm run dev:server` | Servidor desarrollo con Socket.IO |
| `npm run build` | Build de producción |
| `npm start` | Servir build de producción |
| `npm run lint` | Ejecutar ESLint |

### Plataforma de Despliegue

- **Hosting**: Vercel (proyecto vinculado).
- **Archivo de configuración**: `.vercel/project.json`.
- **Base de datos**: Firebase Firestore (plan Spark - gratuito).

---

## 10. Dependencias (package.json)

### Producción

```json
{
  "firebase": "^12.14.0",
  "lucide-react": "^1.17.0",
  "next": "16.2.6",
  "next-themes": "^0.4.6",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "socket.io": "^4.8.3",
  "socket.io-client": "^4.8.3"
}
```

### Desarrollo

```json
{
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "eslint": "^9",
  "eslint-config-next": "16.2.6",
  "typescript": "^5"
}
```

---

## 11. Estructura del Proyecto

```
FilApp/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Layout raíz con ThemeProvider
│   │   ├── page.tsx            # Landing + Login + Portal selector
│   │   ├── globals.css         # Variables CSS, temas, estilos globales
│   │   ├── admin/              # Panel de administración/gerencia
│   │   ├── funcionarios/       # Panel de atención de funcionarios
│   │   ├── totem/              # Tótem de autoatención
│   │   ├── tv/                 # Pantalla TV sala de espera
│   │   ├── central/            # Módulo de recepción central
│   │   ├── register/           # Registro de nueva institución
│   │   └── api/
│   │       ├── whatsapp/route.ts   # Proxy WhatsApp CallMeBot
│   │       └── notify/route.ts     # Webhook n8n
│   ├── components/
│   │   ├── theme-provider.tsx  # Provider next-themes
│   │   ├── theme-toggle.tsx    # Botón tema oscuro/claro
│   │   ├── UserForm.tsx        # Formulario datos de paciente
│   │   └── UserDirectory.tsx   # Directorio de pacientes
│   └── lib/
│       ├── firebase/client.ts  # Config y conexión Firebase
│       ├── chile-locations.ts  # Regiones/provincias/comunas Chile
│       └── notify.ts           # Utilidad de webhook
├── server.js                   # Servidor HTTP + Socket.IO
├── docs/
│   ├── MANUAL_DE_USO.md        # Manual de usuario
│   └── FICHA_TECNICA.md        # Esta ficha técnica
└── public/
    ├── ding.mp3                # Sonido de notificación TV
    └── favicon.ico
```

---

## 12. Licencia

**Propietaria**. Todos los derechos reservados.

Desarrollado para instituciones públicas y privadas en Chile.

---

*Documento generado el 11 de junio de 2026.*
*FilApp OS v2.0*
