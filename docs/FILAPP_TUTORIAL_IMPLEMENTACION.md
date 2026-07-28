# FilApp OS — Tutorial de Uso e Implementacion

**Sistema Multi-Institucion de Gestion de Filas**

---

## Indice

1. [Que es FilApp OS](#1-que-es-filapp-os)
2. [Requisitos Previos](#2-requisitos-previos)
3. [Instalacion y Configuracion](#3-instalacion-y-configuracion)
4. [Despliegue en Vercel](#4-despliegue-en-vercel)
5. [Configuracion de Firebase](#5-configuracion-de-firebase)
6. [Creacion Masiva de Usuarios](#6-creacion-masiva-de-usuarios)
7. [Roles del Sistema](#7-roles-del-sistema)
8. [Uso: Registro de Institucion](#8-uso-registro-de-institucion)
9. [Uso: Panel del Administrador](#9-uso-panel-del-administrador)
10. [Uso: Panel del Funcionario](#10-uso-panel-del-funcionario)
11. [Uso: Totes de Autoatencion](#11-uso-totem-de-autoatencion)
12. [Uso: Pantalla TV Sala de Espera](#12-uso-pantalla-tv-sala-de-espera)
13. [Uso: Central / Recepcion](#13-uso-central--recepcion)
14. [Uso: Panel Gerencial](#14-uso-panel-gerencial)
15. [Configuracion de WhatsApp](#15-configuracion-de-whatsapp)
16. [Integracion con n8n Webhooks](#16-integracion-con-n8n-webhooks)
17. [Hardware Recomendado](#17-hardware-recomendado)
18. [Solucion de Problemas](#18-solucion-de-problemas)
19. [Tabla de Contenido Tecnico](#19-tabla-de-contenido-tecnico)

---

## 1. Que es FilApp OS

FilApp OS es un sistema web de gestion de filas y atencion ciudadana para instituciones publicas y privadas. Digitaliza el proceso de toma de ticket: el ciudadano ingresa su RUT en un totem, el funcionario atiende desde su panel, la pantalla TV anuncia el turno con voz, y todo queda registrado con metricas en tiempo real.

### Caracteristicas principales

- Multi-institucion (multi-tenant): cada institucion tiene datos aislados
- Tiempo real: actualizaciones instantaneas en todas las interfaces
- 4 interfaces: Totes, Funcionario, TV, Administracion
- Voz en espanol para pantalla TV (voces neurales Microsoft)
- Notificaciones WhatsApp a funcionarios
- Exportacion CSV de reportes
- Roles diferenciados: Gerente, Administrador, Funcionario
- Sin instalacion: 100% web, funciona en cualquier navegador

---

## 2. Requisitos Previos

### Para desarrollo/despliegue

| Requisito | Version minima |
|-----------|---------------|
| Node.js | 18+ |
| npm | 9+ |
| Cuenta GitHub | Gratis |
| Cuenta Vercel | Gratis (plan Hobby) |
| Cuenta Firebase | Gratis (plan Spark) |

### Para uso en produccion

- Navegador Chrome 90+, Edge 90+ o Firefox 90+
- Conexion a internet (minimo 5 Mbps, recomendado 20 Mbps)
- Para TV: dispositivo con parlante (Mini PC o Smart TV)
- Para totem: pantalla tactil o tablet

---

## 3. Instalacion y Configuracion

### 3.1 Clonar el repositorio

```bash
git clone https://github.com/basstian1992/FilApp.git
cd FilApp
```

### 3.2 Instalar dependencias

```bash
npm install
```

### 3.3 Configurar variables de entorno

Crear el archivo `.env.local` en la raiz del proyecto:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=tu_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu_proyecto_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu_proyecto.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=tu_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=tu_measurement_id
```

> Estos valores se obtienen desde Firebase Console > Configuracion de la aplicacion web.

### 3.4 Ejecutar en desarrollo

```bash
# Opcion 1: Sin Socket.IO (suficiente para desarrollo)
npm run dev

# Opcion 2: Con Socket.IO (para notificaciones en tiempo real)
npm run dev:server
```

La app estara disponible en `http://localhost:3000`.

### 3.5 Comandos disponibles

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo Next.js |
| `npm run dev:server` | Desarrollo con Socket.IO (server.js) |
| `npm run build` | Build de produccion |
| `npm run start` | Servir build de produccion |
| `npm run lint` | Ejecutar ESLint |

---

## 4. Despliegue en Vercel

### 4.1 Conexion con GitHub

1. Subir el repositorio a GitHub
2. Ir a [vercel.com](https://vercel.com) y crear cuenta
3. Click en "Add New Project"
4. Seleccionar el repositorio de GitHub
5. Vercel detecta automaticamente Next.js

### 4.2 Variables de entorno en Vercel

En el dashboard de Vercel > Settings > Environment Variables, agregar las 8 variables de Firebase:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
```

### 4.3 Deploy

- **Automatico**: cada push a `master` activa un build y deploy automatico en Vercel
- **Manual**: ejecutar `npx vercel deploy --prod`

### 4.4 Socket.IO en produccion

En Vercel, las serverless functions no mantienen estado de Socket.IO. Para funcionalidad completa de Socket.IO en produccion, se requiere un servidor dedicado (Render, Railway, etc.) ejecutando `server.js`. Sin embargo, la app funciona correctamente sin Socket.IO usando Firestore `onSnapshot` como mecanismo principal de tiempo real.

### 4.5 URL de produccion

La URL se asigna automaticamente por Vercel:
```
https://tu-proyecto.vercel.app
```

Las interfaces publicas son:

| Interfaz | URL |
|----------|-----|
| Landing / Login | `https://tu-proyecto.vercel.app` |
| Totes | `https://tu-proyecto.vercel.app/totem?institution=ID` |
| TV | `https://tu-proyecto.vercel.app/tv?institution=ID` |
| Funcionario | `https://tu-proyecto.vercel.app/funcionarios` |
| Admin | `https://tu-proyecto.vercel.app/admin` |
| Central | `https://tu-proyecto.vercel.app/central` |

---

## 5. Configuracion de Firebase

### 5.1 Crear proyecto en Firebase

1. Ir a [Firebase Console](https://console.firebase.google.com)
2. Click "Agregar proyecto"
3. Nombrar el proyecto (ej: `filapp-mi-institucion`)
4. Desactivar Google Analytics (opcional)
5. Click "Crear proyecto"

### 5.2 Habilitar servicios

#### Authentication
1. Firebase Console > Authentication > Get started
2. Habilitar metodo "Email/Password"
3. No habilitar otros metodos (la app solo usa email/password)

#### Firestore Database
1. Firebase Console > Firestore Database > Create database
2. Seleccionar "Start in test mode"
3. Seleccionar region mas cercana (us-east1 recomendado)
4. Click "Enable"

### 5.3 Aplicacion web

1. Firebase Console > Configuracion (engranaje) > General
2. Scroll a "Tus aplicaciones" > Click en icono web `</>`
3. Nombrar la app (ej: "FilApp Web")
4. Copiar los valores de configuracion al `.env.local`

### 5.4 Reglas de Firestore

Las reglas de seguridad estan definidas en `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // especialistas: solo usuarios autenticados
    match /especialistas/{docId} {
      allow read, write: if request.auth != null;
    }
    // institutions: lectura publica (TV/Totem), escritura autenticada
    match /institutions/{docId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }
    // turnos: lectura publica (TV/Totem), escritura autenticada
    match /turnos/{docId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }
    // usuarios: solo usuarios autenticados
    match /usuarios/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Para desplegar reglas:
```bash
npx firebase-tools deploy --only firestore:rules
```

### 5.5 Indice compuesto

Si aparecen errores de Firestore sobre indices faltantes, Firebase provee un link directo en la consola del navegador para crearlos automaticamente. Click en el link del error y se crean los indices necesarios.

---

## 6. Creacion Masiva de Usuarios

### 6.1 Desde el panel de Administracion

1. Ir a `/admin` > pestana "Funcionarios"
2. Seccion "Carga Masiva de Funcionarios"
3. Seleccionar archivo Excel (.xlsx o .xls)
4. Columnas requeridas: `correo` y `nombre_completo`
5. Columnas opcionales: `rut`, `telefono`, `departamento`, `cargo`
6. Vista previa: el sistema muestra los usuarios detectados
7. Click "Crear N"
8. Cada usuario recibe contrasena: `123456`

> Importante: los usuarios creados quedan en estado "pendiente" hasta que el admin los apruebe.

### 6.2 Con script de Node.js (firebase-admin)

Para crear gran cantidad de usuarios sin limites de tasa:

```bash
# 1. Instalar firebase-admin
npm install firebase-admin

# 2. Colocar el archivo de service account en la raiz del proyecto
# Archivo: filapp-TU-ID-firebase-adminsdk-XXXXX.json

# 3. Preparar Excel con columna "correo"

# 4. Ejecutar el script
node scripts/bulk-create-users.mjs
```

El script:
- Lee el archivo Excel (`base de datos consolidada 22 07 2026.xlsx`)
- Crea cada usuario en Firebase Auth con contrasena `123456`
- Crea el documento en Firestore coleccion `usuarios`
- Concurrency de 10 usuarios simultaneos
- Reporta resumen: creados, ya existentes, errores

> El archivo de service account NUNCA debe subirse a GitHub. Esta en `.gitignore`.

---

## 7. Roles del Sistema

| Rol | Quien lo tiene | Que puede hacer |
|-----|---------------|-----------------|
| **Gerente** | Emails autorizados por defecto | Ver TODAS las instituciones, crear/autorizar admins, reset global |
| **Administrador** | Creado por gerente o auto-registro | Gestionar SU institucion: config, funcionarios, reportes |
| **Funcionario** | Creado por administrador | Atender turnos, llamar pacientes, registrar datos |
| **Central** | Cualquier cuenta autenticada | Generar turnos manualmente (recepcion) |

---

## 8. Uso: Registro de Institucion

### Paso 1: Crear institucion

1. Ir a `https://tu-app.vercel.app`
2. Click "Crear Nueva Institucion"
3. Completar:
   - Nombre de la institucion (ej: "Municipalidad de San Juan")
   - Nombre del administrador
   - Correo del administrador
   - Contrasena (minimo 6 caracteres)
4. Click "Crear Institucion"

### Paso 2: Autorizacion

La institucion queda en estado "pendiente". Un Gerente debe autorizarla desde el Panel Gerencial antes de que pueda usarse.

### Paso 3: Configurar

Una vez autorizada, el administrador ingresa y configura:
- Nombre que aparece en TV
- Logo de la institucion (URL de imagen)
- Color primario de la TV
- Departamentos de atencion (ej: "OIRS, Tesoreria, Atencion General")
- Departamento OIRS (para consultas rapidas)

---

## 9. Uso: Panel del Administrador

URL: `/admin`

### Pestana Dashboard

- **KPIs en tiempo real**: turnos en espera, atendidos hoy, tiempo promedio de espera
- **Estado del personal**: ve el estado de todos los funcionarios
- **Reinicio de conteo**: resetea el contador de tickets a 0

### Pestana Configuracion

| Campo | Descripcion |
|-------|-------------|
| Nombre en TV | Titulo que aparece en la pantalla de sala de espera |
| Logo URL | URL de la imagen del logo (se muestra en TV y totem) |
| Color primario | Color hex para la interfaz de TV |
| Fondo TV | URL de imagen de fondo para TV |
| Mensaje del dia | Texto que se desplaza en la TV |
| Departamentos | Lista separada por coma (ej: "OIRS, Tesoreria, RRHH") |
| Depto. OIRS | Nombre del departamento para atencion directa |
| Webhook n8n | URL para enviar eventos a n8n |

### Pestana Funcionarios

**Registrar funcionario nuevo:**
1. Click "Agregar Funcionario"
2. Completar: nombre, correo, contrasena, departamento, cargo, modulo (letra)
3. Click "Registrar"

**Editar modulo de un funcionario:**
1. En la tabla, hacer click sobre la letra de modulo
2. Escribir nueva letra (ej: "B")
3. Presionar Enter para guardar o Escape para cancelar

**Carga masiva:**
1. Subir archivo Excel con columna `correo`
2. Vista previa
3. Click "Crear N usuarios"

**Aprobar cuentas pendientes:**
1. En la tabla, ver usuarios con estado "pendiente"
2. Click "Aprobar" o "Rechazar"

### Pestana Base de Datos

- Directorio de todos los pacientes registrados
- Busqueda por RUT o nombre
- Exportacion CSV

### Pestana Reportes

- Exportar usuarios a CSV
- Exportar turnos a CSV
- Exportar funcionarios a CSV

---

## 10. Uso: Panel del Funcionario

URL: `/funcionarios`

### Barra superior

| Elemento | Funcion |
|----------|---------|
| Avatar | Click para cambiar foto (URL) |
| Nombre | Click para editar |
| Institucion | Nombre y logo de la institucion |
| Departamento | Area de atencion |
| Modulo (letra) | Click para editar la letra de modulo |
| Estado | Click para alternar activo/inactivo |

### Cola de espera (panel izquierdo)

- **Numero grande**: pacientes en espera para su departamento
- **Lista de turnos**: maximo 8 visibles, ordenados por prioridad
  - Turnos con hora agendada aparecen con distintivo y prioridad alta
- **Boton "Llamar Siguiente"**: llama al proximo turno de la cola
- **Ingreso manual**: campo para crear turno directo con RUT

### Turno activo (panel derecho)

- **Nombre del paciente** (o RUT si no se encontro nombre)
- **Numero de turno y RUT**
- Indicador de **Hora Agendada** o **Atencion General**
- **Historial del paciente**: atenciones anteriores
- **Formulario de datos**: permite registrar/editar datos del paciente
- **Boton "Finalizar Atencion"**: marca turno como atendido
- **Boton "Saltar"**: marca turno como no presentado

### Flujo de atencion

```
1. Paciente llega al totem y toma turno
2. Turno aparece en la cola del funcionario
3. Funcionario presiona "Llamar Siguiente"
4. TV anuncia el turno con voz
5. Paciente se dirige al modulo indicado
6. Funcionario atiende y registra datos
7. Funcionario presiona "Finalizar Atencion"
8. Siguiente paciente
```

### Vinculacion WhatsApp

1. Obtener API Key de CallMeBot (ver seccion 15)
2. En la seccion inferior del panel, ingresar:
   - Numero: formato internacional sin `+` (ej: `56912345678`)
   - API Key: la clave recibida de CallMeBot
3. Click "Vincular WhatsApp y Probar"
4. Si recibe mensaje de prueba, la configuracion es correcta

---

## 11. Uso: Totes de Autoatencion

URL: `/totem?institution=ID`

### Modos de atencion

| Modo | Descripcion | Flujo |
|------|-------------|-------|
| **Atencion General** | Orden de llegada | RUT > Seleccionar departamento > Turno generado |
| **Orientacion / OIRS** | Consultas rapidas | RUT > Turno directo a OIRS (sin seleccion) |
| **Hora Agendada** | Cita programada | RUT > Seleccionar departamento > Seleccionar funcionario > Turno prioritario |

### Uso del totem

1. La pantalla muestra tres botones grandes
2. El usuario selecciona el tipo de atencion
3. Ingresa su RUT usando el teclado virtual o fisico
4. Selecciona departamento o funcionario
5. El sistema genera un ticket con numero y letra
6. La pantalla se reinicia automaticamente despues de 20 segundos

### Validacion de RUT

- El sistema valida el RUT chileno con algoritmo modulo 11
- Si el RUT no es valido, muestra una advertencia informativa
- Permite continuar con documentos extranjeros (no bloquea)

### Configuracion del totem

- El totem entra automaticamente en pantalla completa
- Si el navegador lo bloquea, aparece un boton flotante
- El logo y nombre de la institucion se cargan desde la configuracion

### Modo kiosko (para totem fisico)

**Windows + Chrome:**
```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://tu-app.vercel.app/totem?institution=ID" --disable-pinch --overscroll-history-navigation=0
```

**Windows + Edge:**
```bat
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk "https://tu-app.vercel.app/totem?institution=ID" --edge-kiosk-type=fullscreen --disable-pinch
```

**Linux + Chromium:**
```bash
chromium-browser --kiosk "https://tu-app.vercel.app/totem?institution=ID" --no-first-run --disable-pinch
```

**Android (tablet):** Usar Fully Kiosk Browser desde Play Store.

---

## 12. Uso: Pantalla TV Sala de Espera

URL: `/tv?institution=ID`

### Display principal

- **Encabezado**: logo centrado de la institucion, nombre, reloj
- **Tarjeta central "Atendiendo a"**: turno actual siendo atendido
  - Numero de turno grande y animado
  - Nombre del paciente
  - Modulo al que dirigirse + departamento (ej: "Modulo A — OIRS")
  - Nombre del funcionario
- **Barra "Ultimos Ingresos"**: ultimos 6 tickets que llegaron
- **Historial**: ultimos 7 turnos llamados previamente
- **Mensaje del dia**: texto desplazable (ticker)
- **Soporte 4K**: resoluciones desde 1080p hasta ultra HD

### Audio y voz

1. Al iniciar, click en "Iniciar Pantalla" (requiere interaccion del usuario)
2. Suena un "ding" antes de cada anuncio
3. El sistema anuncia en voz alta: *"Siguiente turno, letra X, numero Y. Dirigirse al modulo Z."*
4. Boton de silenciar/activar audio en la cabecera

### Seleccion de voces (prioridad)

El sistema selecciona automaticamente la mejor voz en espanol latinoamericano:

1. Microsoft Raul / Jorge (neural)
2. Microsoft Catalina / Pablo (neural)
3. Microsoft Helena / Sabina / Carolina / Dalia (neural)
4. Cualquier voz "Natural" o "Premium" en espanol
5. Voces Google Espanol
6. Cualquier voz en `es-CL`, `es-MX`, `es-AR`, `es-CO`, `es-PE`

> Nota: las voces de Microsoft requieren Microsoft Edge o Windows con voces instaladas. En Chrome, se usan las voces Google.

### Temas

- Oscuro (default) y Claro
- Boton de cambio en la cabecera

### Configuracion desde Admin

- Logo centrado en el encabezado (3x mas grande que antes)
- Color primario
- Fondo personalizado (URL de imagen)
- Mensaje del dia

---

## 13. Uso: Central / Recepcion

URL: `/central`

Para personal de recepcion que gestiona turnos manualmente (cuando el totem no esta disponible).

### Funcionalidades

| Boton | Accion |
|-------|--------|
| **Generar Turno Normal** | Crea ticket y envia a sala de espera |
| **Registrar Orientacion** | Registra atencion rapida sin pasar por cola |

### Flujo

1. Ingrese RUT del paciente
2. Ingrese nombre (opcional)
3. Seleccione: Turno Normal u Orientacion
4. El turno se genera automaticamente

### Diferencia con el totem

- Central requiere login (no es publico)
- Permite generar orientaciones (atenciones que no pasan por la cola)
- No tiene seleccion de departamentos (va al general por defecto)

---

## 14. Uso: Panel Gerencial

Acceso exclusivo para emails autorizados:
- `b.alarconatenas@gmail.com`
- `contacto@asesoriapublica.cl`

### Funcionalidades

| Pestana | Que hace |
|---------|----------|
| **Instituciones** | Ver todas las instituciones, crear nuevas, autorizar pendientes, gestionar |
| **Administradores** | Registrar admins, asignarlos a instituciones |
| **Reportes** | Descargar base de datos completa, por institucion |

### Autorizar institucion

1. Ver lista de instituciones pendientes
2. Click "Autorizar Ingreso"
3. La institucion cambia a estado "activa"
4. El admin de esa institucion puede comenzar a usar el sistema

### Gestionar institucion

Al click "Gestionar", se abre el mismo panel de administracion pero con acceso global.

---

## 15. Configuracion de WhatsApp

### Obtener API Key de CallMeBot

1. Agregar el numero `+34 691 62 17 28` a los contactos del telefono
2. Abrir WhatsApp y enviar mensaje: `I allow callmebot to send me messages`
3. Recibir la API Key por respuesta
4. Usar esa API Key en el panel del funcionario

### Configurar en el panel del funcionario

1. Ingresar numero con codigo de pais sin `+` (ej: `56912345678`)
2. Ingresar la API Key recibida
3. Click "Vincular WhatsApp y Probar"
4. Si llega el mensaje de prueba, funciona correctamente

### Tipos de notificaciones

| Evento | Mensaje ejemplo |
|--------|----------------|
| Nuevo turno | "Se ha solicitado un nuevo turno en tu modulo de [departamento]. Turno: A-42. Personas en cola: 3" |
| Recordatorio (10 min) | "El turno A-42 lleva mas de 10 minutos esperando en [departamento]. Personas en cola: 3" |

### Limites

- CoolDown: maximo 1 mensaje cada 35 segundos por numero
- Recordatorios: maximo 1 cada 10 minutos por turno

---

## 16. Integracion con n8n Webhooks

### Configurar webhook

1. En el panel de Admin > Configuracion
2. Ingresar la URL del webhook de n8n
3. Guardar

### Eventos enviados

| Evento | Trigger | Payload |
|--------|---------|---------|
| `ingreso` | Nuevo turno creado | `{ action, numero, rut_usuario, institution_id }` |
| `llamado` | Turno llamado por funcionario | `{ action, numero, rut_usuario, institution_id }` |

### Endpoint de la API

```
POST /api/notify
Content-Type: application/json

{
  "webhookUrl": "https://n8n.ejemplo.com/webhook/...",
  "payload": { "action": "ingreso", "numero": 42, ... }
}
```

---

## 17. Hardware Recomendado

### Totem de autoatencion

| Componente | Minimo | Recomendado |
|-----------|--------|-------------|
| Pantalla | 15.6" tactil | 21.5" – 32" tactil capacitiva |
| Procesador | Celeron N4000 | Core i3 / Ryzen 3 |
| RAM | 4 GB | 8 GB |
| Almacenamiento | 32 GB eMMC | 64 GB SSD |
| Conexion | WiFi 5 | Ethernet |

**Opciones de equipo:**
- All-in-One tactil POS: $400.000 – $800.000 CLP (recomendado)
- Tablet 10"-13" en soporte: $150.000 – $350.000 CLP
- PC + Monitor tactil: $300.000 – $600.000 CLP

### Pantalla TV

| Componente | Minimo | Recomendado |
|-----------|--------|-------------|
| Pantalla | 32" LED | 43" – 65" LED |
| Resolucion | 1080p | 4K |
| Equipo | Smart TV con navegador | Mini PC + TV |
| Audio | Parlante integrado | Parlante externo o barra |

**Opciones:**
- Smart TV + navegador: $250.000 – $500.000 CLP (sin voz)
- TV + Mini PC N95: $300.000 – $600.000 CLP (recomendado, con voz)

### Estacion de funcionario

- Cualquier PC moderna funciona (100% web)
- Recomendado: monitor dual
- Minimo: 4 GB RAM, Chrome 90+

### Resumen de equipamiento

| Equipo | Cantidad | Costo unitario | Total |
|--------|----------|---------------|-------|
| Totes tactil | 1-2 | $500.000 | $500K – $1M |
| TV 50" + Mini PC | 1-3 | $450.000 | $450K – $1.35M |
| PC funcionario | 1-10 | $350.000 | $350K – $3.5M |
| **Total estimado** | | | **$1.35M – $5.9M CLP** |

---

## 18. Solucion de Problemas

| Problema | Causa | Solucion |
|----------|-------|----------|
| No carga la pantalla | Sin conexion | Verificar internet, recargar |
| El audio no funciona | Requiere interaccion | Click "Iniciar Pantalla" |
| No escucho la voz | Volumen bajo o sin voces | Verificar volumen, usar Edge en Windows para voces Microsoft |
| Error al login | Credenciales incorrectas | Verificar email/contrasena, contactar admin |
| No aparecen turnos en TV | URL incorrecta o sin datos | Verificar que `?institution=ID` sea correcto |
| Funcionario no ve turnos | Indice faltante | Crear indice compuesto desde Firebase Console (link en error) |
| WhatsApp no llega | API Key incorrecta | Verificar en CallMeBot, usar formato `569XXXXXXXX` |
| "Too many requests" en WhatsApp | Limite de CallMeBot | Esperar 1 minuto antes de enviar mas |
| Cuenta pendiente | Admin no aprobo | Contactar administrador |
| Totem no avanza | Error de Firestore | Verificar conexion, recargar pagina |
| RUT extranjero | Validacion chilena | Se muestra advertencia informativa, puede continuar |
| Errores de build | Version de Node | Usar Node.js 18 o superior |

---

## 19. Tabla de Contenido Tecnico

### Estructura del proyecto

```
FilApp/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing + login + portal selector
│   │   ├── layout.tsx            # Root layout (ThemeProvider, Toast)
│   │   ├── globals.css           # Estilos globales y variables CSS
│   │   ├── admin/page.tsx        # Panel administrador y gerente
│   │   ├── admin/admin.module.css
│   │   ├── funcionarios/page.tsx # Panel funcionario
│   │   ├── funcionarios/funcionarios.module.css
│   │   ├── totem/page.tsx        # Totem de autoatencion
│   │   ├── totem/totem.module.css
│   │   ├── tv/page.tsx           # Pantalla TV
│   │   ├── tv/tv.module.css
│   │   ├── central/page.tsx      # Recepcion central
│   │   ├── central/central.module.css
│   │   ├── register/page.tsx     # Registro de institucion
│   │   └── api/
│   │       ├── whatsapp/route.ts # Proxy WhatsApp CallMeBot
│   │       └── notify/route.ts   # Webhook n8n
│   ├── components/
│   │   ├── Skeleton.tsx          # Pantalla de carga
│   │   ├── theme-provider.tsx    # Provider next-themes
│   │   ├── theme-toggle.tsx      # Boton tema oscuro/claro
│   │   ├── Toast.tsx             # Notificaciones toast
│   │   ├── UserDirectory.tsx     # Directorio de usuarios
│   │   └── UserForm.tsx          # Formulario de datos de paciente
│   ├── hooks/
│   │   └── useSoundManager.ts    # Sonidos de notificacion
│   └── lib/
│       ├── firebase/client.ts    # Config Firebase
│       ├── chile-locations.ts    # Regiones/provincias/comunas Chile
│       └── notify.ts             # Trigger de webhooks
├── scripts/
│   └── bulk-create-users.mjs     # Script creacion masiva (firebase-admin)
├── server.js                     # Servidor HTTP + Socket.IO
├── firestore.rules               # Reglas de seguridad Firestore
├── firebase.json                 # Config Firebase Tools
├── next.config.ts                # Config Next.js
├── package.json                  # Dependencias
├── .env.local                    # Variables de entorno (NO subir a git)
└── docs/                         # Documentacion
```

### Modelo de datos (Firestore)

| Coleccion | Documento ID | Campos principales |
|-----------|-------------|-------------------|
| `institutions` | Auto-ID | name, owner_id, estado, currentTurno, config |
| `especialistas` | Auto-ID | user_id, institution_id, role, nombre, letra_atencion, departamento |
| `turnos` | Auto-ID | institution_id, numero, rut_usuario, estado, letra_ticket |
| `usuarios` | RUT | rut, nombre, institution_id, created_at |

### Estados de un turno

| Estado | Significado |
|--------|-------------|
| `espera` | Turno en cola, esperando ser llamado |
| `llamado` | Turno llamado, paciente dirigiendose al modulo |
| `atendido` | Atencion completada |
| `saltado` | Paciente no se presento |

### Estados de un funcionario

| Estado | Significado |
|--------|-------------|
| `activo` | Disponible para atender |
| `inactivo` | No disponible |
| `pendiente` | Esperando aprobacion del admin |
| `atendiendo` | Atendiendo un paciente |

### API endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/whatsapp` | Enviar mensaje WhatsApp via CallMeBot |
| POST | `/api/notify` | Enviar webhook a n8n |

### Variables de entorno

| Variable | Proposito |
|----------|-----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | API Key de Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Dominio de autenticacion |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ID del proyecto Firebase |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Bucket de almacenamiento |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ID de remitente de mensajes |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ID de la aplicacion |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | ID de medicion Analytics |

---

*Documento actualizado el 28 de julio de 2026 — FilApp OS v2.0*
*Desarrollado por www.asesoriapublica.cl*
