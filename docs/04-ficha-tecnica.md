# Ficha Técnica — FilApp OS

## 1. Stack Tecnológico

| Componente | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| Lenguaje | TypeScript | 5.x |
| UI | React | 19.2.4 |
| Bundler | Turbopack (built-in Next.js 16) | — |
| Base de datos | Firebase Firestore | 12.14.0 |
| Autenticación | Firebase Auth | 12.14.0 |
| Tiempo real | Firestore `onSnapshot` + Socket.io | 4.8.3 |
| Estilos | CSS Modules | — |
| Iconos | Lucide React | 1.17.0 |
| Temas | next-themes | 0.4.6 |
| Notificaciones (WhatsApp) | CallMeBot API | — |
| Exportación | xlsx (SheetJS) | 0.18.5 |
| Linter | ESLint + eslint-config-next | 16.2.6 |

## 2. Despliegue

### 2.1 Hosting
- **Plataforma**: Vercel (plan Hobby/Pro).
- **URL producción**: `https://filapp-two.vercel.app`
- **Región de build**: Washington, D.C., USA (East) – iad1.

### 2.2 Variables de Entorno
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### 2.3 Comandos
```bash
npm run dev        # Entorno local (puerto 3000)
npm run build      # Build producción
npm run start      # Servir build local
npm run lint       # ESLint
npx vercel deploy --prod   # Deploy a Vercel
```

## 3. Estructura del Proyecto

```
src/
├── app/
│   ├── page.tsx              # Landing + login + portal selector
│   ├── layout.tsx            # Root layout (ThemeProvider, Toast)
│   ├── globals.css           # Estilos globales y variables CSS
│   ├── admin/page.tsx        # Panel administrador y gerente
│   ├── central/page.tsx      # Punto de atención centralizada
│   ├── funcionarios/page.tsx # Panel funcionario
│   ├── totem/page.tsx        # Tótem de autoatención
│   ├── tv/page.tsx           # Pantalla TV sala de espera
│   ├── register/page.tsx     # Registro de usuarios
│   └── api/
│       ├── whatsapp/route.ts # API endpoint WhatsApp (CallMeBot)
│       └── notify/route.ts   # API endpoint webhooks (n8n)
├── components/
│   ├── Skeleton.tsx          # Componente de carga
│   ├── theme-provider.tsx    # Proveedor de temas (next-themes)
│   ├── theme-toggle.tsx      # Botón de cambio de tema
│   ├── Toast.tsx             # Sistema de notificaciones toast
│   ├── UserDirectory.tsx     # Directorio de usuarios
│   └── UserForm.tsx          # Formulario de datos de usuario
├── hooks/
│   └── useSoundManager.ts   # Hook de sonidos/notificaciones
├── lib/
│   ├── firebase/client.ts   # Configuración Firebase
│   ├── notify.ts             # Trigger de webhooks
│   └── chile-locations.ts    # Regiones, provincias, comunas de Chile
└── middleware.ts              # Next.js middleware
```

## 4. Firestore — Colecciones

### `institutions`
| Campo | Tipo | Descripción |
|---|---|---|
| `name` | string | Nombre de la institución |
| `owner_id` | string | UID del admin propietario |
| `owner_email` | string | Email del admin |
| `estado` | string | `activa` o `pendiente` |
| `currentTurno` | number | Contador de tickets |
| `ultimo_reinicio` | string (ISO) | Último reset del contador |
| `reset_logs` | array | Historial de resets |
| `config` | object | `{ tv_name, logo_url, tv_primary_color, tv_background_url, mensaje_dia, departamentos[], oirs_departamento, n8n_webhook_url }` |

### `especialistas`
| Campo | Tipo | Descripción |
|---|---|---|
| `user_id` | string | UID de Firebase Auth |
| `institution_id` | string | Institución a la que pertenece |
| `role` | string | `gerente`, `admin`, `funcionario` |
| `nombre` | string | Nombre completo |
| `email` | string | Correo electrónico |
| `departamento` | string | Departamento asignado |
| `cargo` | string | Cargo del funcionario |
| `letra_atencion` | string | Letra de módulo (ej: "A", "B") |
| `estado_funcionario` | string | `activo`, `inactivo`, `pendiente`, `atendiendo` |
| `avatar_url` | string | URL de foto de perfil |
| `whatsapp_phone` | string | Teléfono WhatsApp |
| `whatsapp_apikey` | string | API Key CallMeBot |

### `turnos`
| Campo | Tipo | Descripción |
|---|---|---|
| `institution_id` | string | Institución |
| `numero` | number | Número de ticket |
| `letra_ticket` | string | Letra del ticket |
| `departamento_solicitado` | string | Departamento destino |
| `rut_usuario` | string | RUT del paciente |
| `estado` | string | `espera`, `llamado`, `atendido`, `saltado` |
| `created_at` | string (ISO) | Fecha de creación |
| `called_at` | string (ISO) | Fecha de llamado |
| `finished_at` | string (ISO) | Fecha de finalización |
| `priority` | boolean | Prioridad alta |
| `priority_level` | number | Nivel de prioridad |
| `is_appointment` | boolean | Es hora agendada |
| `funcionario_id` | string | Funcionario asignado |
| `funcionario_nombre` | string | Nombre del funcionario |
| `especialista_id` | string | Especialista que atendió |
| `nombre_funcionario` | string | Nombre de quien atendió |
| `departamento` | string | Departamento de atención |
| `cargo_funcionario` | string | Cargo del funcionario |
| `letra_especialista` | string | Módulo del especialista |

### `usuarios`
| Campo | Tipo | Descripción |
|---|---|---|
| `rut` | string | RUT (usado como ID del doc) |
| `institution_id` | string | Institución |
| `created_at` | string (ISO) | Fecha de registro |

## 5. Firestore — Reglas de Seguridad

```javascript
// firestore.rules
rules_version = '2';
// especialistas: solo autenticados
// institutions: lectura pública, escritura autenticada
// turnos: lectura pública, escritura autenticada
// usuarios: solo autenticados
```

## 6. API Endpoints

### `POST /api/whatsapp`
Envía un mensaje WhatsApp vía CallMeBot.

**Body:**
```json
{
  "phone": "56912345678",
  "message": "Texto del mensaje",
  "apikey": "API_KEY"
}
```

**Response:** `{ success: true, data: "..." }` o `{ error: "..." }`

### `POST /api/notify`
Envía un webhook a n8n u otro sistema.

**Body:**
```json
{
  "webhookUrl": "https://n8n.ejemplo.com/webhook/...",
  "payload": { "action": "ingreso|llamado", ...turnoData }
}
```

## 7. Dependencias Principales

```json
{
  "firebase": "^12.14.0",
  "lucide-react": "^1.17.0",
  "next": "16.2.6",
  "next-themes": "^0.4.6",
  "react": "19.2.4",
  "socket.io": "^4.8.3",
  "socket.io-client": "^4.8.3",
  "xlsx": "^0.18.5"
}
```

## 8. Navegadores Soportados

- Chrome/Edge 90+
- Firefox 90+
- Safari 15+
- Opera 76+

## 9. Licencia

Código propietario. Desarrollado por [www.asesoriapublica.cl](https://www.asesoriapublica.cl).

---

*Documento generado el 11 de junio de 2026 — FilApp OS v2.0*
