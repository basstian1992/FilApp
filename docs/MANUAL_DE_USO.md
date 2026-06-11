# Manual de Uso — FilApp OS

## Sistema Multi-Institución de Gestión de Filas

---

## Índice

1. [Introducción](#1-introducción)
2. [Roles del Sistema](#2-roles-del-sistema)
3. [Página de Inicio / Login](#3-página-de-inicio--login)
4. [Panel del Gerente](#4-panel-del-gerente)
5. [Panel del Administrador](#5-panel-del-administrador)
6. [Panel del Funcionario](#6-panel-del-funcionario)
7. [Tótem de Autoatención](#7-tótem-de-autoatención)
8. [Pantalla TV Sala de Espera](#8-pantalla-tv-sala-de-espera)
9. [Central / Recepción](#9-central--recepción)
10. [Registro de Nueva Institución](#10-registro-de-nueva-institución)
11. [WhatsApp y Notificaciones](#11-whatsapp-y-notificaciones)
12. [Exportación de Datos](#12-exportación-de-datos)

---

## 1. Introducción

**FilApp OS** es un sistema moderno de gestión de filas y atención de usuarios, diseñado para instituciones públicas y privadas. Permite administrar turnos en tiempo real, con roles diferenciados, pantalla TV para salas de espera, tótem de autoatención y reportes exportables.

### Acceso a la aplicación

```
https://filapp-f5682.vercel.app
```

---

## 2. Roles del Sistema

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| **Gerente** | Superadministrador global. Ve todas las instituciones, crea y autoriza administradores. | Login con email autorizado |
| **Administrador** | Gestiona una institución específica: configuración, funcionarios, reportes. | Login creado por Gerente o auto-registro |
| **Funcionario** | Atiende pacientes desde su módulo. Ve cola por departamento. | Login creado por Administrador |
| **Central** | Recepción. Genera turnos manuales sin tótem. | Login con cualquier cuenta |

---

## 3. Página de Inicio / Login

### Acceso

1. Abra la URL principal del sistema.
2. En el panel derecho verá dos opciones:
   - **Nueva Institución**: para registrarse como nueva institución.
   - **Iniciar Sesión**: para ingresar con credenciales existentes.

### Inicio de Sesión

1. Ingrese su correo electrónico y contraseña.
2. Haga clic en "Ingresar al Panel".
3. El sistema detecta automáticamente su rol y lo redirige al panel correspondiente:
   - **Gerente/Admin** → Panel de Administración
   - **Funcionario** → Panel de Atención

### Portal de Acceso

Una vez autenticado, verá tarjetas de acceso rápido:
- **Panel Gerencial / Administración**
- **Panel de Atención** (solo funcionarios)
- **Pantalla TV** (abre en nueva pestaña)
- **Tótem** (abre en nueva pestaña)

---

## 4. Panel del Gerente

Acceso exclusivo para emails autorizados (`b.alarconatenas@gmail.com`, `contacto@asesoriapublica.cl`).

### Vista General

- **Todas las Instituciones**: listado completo con estado (activa/pendiente).
- **Crear Institución**: formulario inline para crear nuevas instituciones.
- **Exportar Admins**: descarga CSV de todos los administradores registrados.

### Acciones por Institución

| Botón | Acción |
|-------|--------|
| Autorizar Ingreso | Aprueba institución pendiente y activa su admin |
| Gestionar | Abre el detalle de la institución (mismo panel que Admin) |
| 👁 (TV) | Abre pantalla TV en nueva pestaña |
| 📱 (Tótem) | Abre tótem en nueva pestaña |
| ⬇ (Exportar BD) | Descarga base de datos de usuarios |

### Registrar Administrador

1. Complete: Nombre, Correo, Contraseña.
2. Haga clic en "Registrar Administrador".
3. El admin queda registrado y debe ser activado al autorizar su institución.

---

## 5. Panel del Administrador

### Pestañas

#### Dashboard
- **KPIs**: En espera, Atendidos hoy, Tiempo espera promedio, Tiempo atención promedio.
- **Estado del Personal**: vista rápida de todos los funcionarios con su estado.
- **Reinicio de Conteo**: resetea el contador de tickets a 0 (con registro de auditoría).

#### Configuración
- **TV & Branding**: nombre en TV, logo URL, color primario, fondo TV, mensaje del día.
- **Departamentos**: categorías de atención (separadas por coma, máx. 200).
- **Webhook n8n**: URL para integración con n8n.
- **Enlaces Públicos**: URLs para TV y Tótem (copiar al portapapeles).

#### Funcionarios
- **Registrar Funcionario**: nombre, correo, contraseña, categoría, cargo, módulo/letra.
- **Tabla por Departamento**: edición inline de nombre, cargo, módulo.
- **Exportar Funcionarios**: descarga CSV.

#### Base de Datos
- Directorio de pacientes registrados.
- Búsqueda por RUT o nombre.
- Importación y exportación CSV.

#### Reportes
- Descarga CSV de: Usuarios, Turnos, Funcionarios.
- Métricas en tiempo real.

---

## 6. Panel del Funcionario

### Barra Superior

- **Avatar**: foto de perfil (clic para cambiar URL).
- **Nombre y Módulo**: editables.
- **Estado**: indicador verde/rojo (clic para alternar activo/inactivo).
- **Notificaciones**: alertas de citas agendadas vía Socket.IO.

### Panel Izquierdo

#### Pacientes en Espera
- Número de pacientes en cola para su departamento.
- Botón **Llamar Siguiente**: asigna el siguiente turno por prioridad.

#### Ingreso Manual
- Campo RUT para registrar pacientes sin tótem.
- Crea turno directo a su escritorio (estado "llamado").

#### Reinicio de Conteo
- Resetea contador a 0 (con registro de auditoría).

#### Alertas de WhatsApp
- Configuración de CallMeBot para notificaciones.
- Ingrese número y API Key para activar.

### Panel Derecho

#### Atención Activa
- Turno actual con RUT del paciente.
- Historial reciente del paciente.
- Botones: **Finalizar Atención** / **Saltar** (no se presenta).
- Formulario de datos del paciente (UserForm).

#### Estado Vacío
- Cuando no hay atención activa, muestra "Disponible".

---

## 7. Tótem de Autoatención

Público — no requiere login.

### URL
```
/totem?institution=ID_INSTITUCION
```

### Modos de Atención

1. **Atención General**: selecciona categoría y genera turno.
2. **Orientación / OIRS**: resuelve consultas rápidas, genera turno a departamento OIRS.
3. **Hora Agendada**: para pacientes con cita programada, selecciona funcionario.

### Flujo

1. Seleccione modo de atención.
2. Ingrese RUT (con teclado virtual o físico).
3. Seleccione categoría o funcionario.
4. Recibe número de turno con letra de módulo.
5. La pantalla se reinicia automáticamente tras 10 segundos.

### Validación de RUT

- Si el RUT no es chileno, se muestra una advertencia informativa.
- Puede continuar con documentos extranjeros sin problema.

---

## 8. Pantalla TV Sala de Espera

Público — no requiere login.

### URL
```
/tv?institution=ID_INSTITUCION
```

### Funcionalidades

- **Turno Actual**: número grande y animado del turno siendo llamado.
- **Módulo**: indicación visual del módulo al que dirigirse.
- **Funcionario**: nombre del funcionario que atiende.
- **Ingresos**: lista de los últimos 6 tickets que ingresaron.
- **Historial**: últimos 7 turnos llamados previamente.
- **Reloj**: hora actual (actualiza cada 30 segundos).
- **Mensaje del Día**: texto desplazable (configurable por Admin).
- **Logo**: imagen de la institución.

### Audio y Voz Premium

1. Al iniciar, presione **"Iniciar Pantalla"** para activar audio.
2. El sistema anuncia en voz alta cada nuevo turno llamado.
3. Suena un "ding" antes de cada anuncio.
4. **Selección inteligente de voces**:
   - Prioriza voces neurales Microsoft (Sabina, Helena, Carolina).
   - Luego Google Español.
   - Finalmente cualquier voz española disponible.
5. Velocidad adaptativa según longitud del texto.
6. Botón de silenciar/activar audio en la cabecera.

### Personalización

- **Logo**: configurable por Admin.
- **Color primario**: tema visual.
- **Fondo**: URL de imagen de fondo.
- **Tema oscuro/claro**: botón en cabecera.

---

## 9. Central / Recepción

Para personal de recepción que gestiona turnos manualmente.

### Funcionalidades

- **Generar Turno Normal**: crea ticket y envía a sala de espera.
- **Registrar Orientación**: registra atención rápida sin pasar por cola.

### Flujo

1. Ingrese RUT del paciente.
2. Ingrese nombre (opcional).
3. Seleccione acción: Turno Normal u Orientación.

---

## 10. Registro de Nueva Institución

Público — no requiere login.

### Pasos

1. **Paso 1 — Institución**: nombre de la institución.
2. **Paso 2 — Administrador**: nombre, correo y contraseña del admin.
3. **Confirmación**: la institución queda pendiente de autorización por un Gerente.

---

## 11. WhatsApp y Notificaciones

### Configuración (Funcionario)

1. Agregue `+34 691 62 17 28` a sus contactos.
2. Envíe mensaje: `I allow callmebot to send me messages`.
3. Recibirá su API Key por respuesta.
4. En el panel, ingrese su número y API Key.

### Notificaciones en Tiempo Real

- **Socket.IO**: nuevo ticket de cita agendada notifica al funcionario.
- **WhatsApp**: cuando llega un nuevo turno a su departamento.
- **Pantalla TV**: actualización instantánea de Firestore.

---

## 12. Exportación de Datos

Todos los reportes se descargan en formato CSV (UTF-8 con BOM para Excel).

### Formatos disponibles

| Exportación | Rol | Contenido |
|-------------|-----|-----------|
| Usuarios | Admin | Todos los pacientes registrados |
| Turnos | Admin | Historial completo de tickets |
| Funcionarios | Admin | Personal con roles y módulos |
| Admins | Gerente | Todos los administradores del sistema |
| Mi Historial | Funcionario | Atenciones personales realizadas |

---

## Solución de Problemas

| Problema | Solución |
|----------|----------|
| No carga la pantalla | Verificar conexión a internet y URL correcta |
| El audio no funciona | Hacer clic en "Iniciar Pantalla" (requiere interacción del usuario) |
| No escucho la voz | Verificar volumen del dispositivo y botón de audio activado |
| Error al hacer login | Verificar credenciales o contactar al administrador |
| No aparecen turnos | Verificar que el tótem esté generando tickets correctamente |
| RUT extranjero | Se permite con advertencia informativa, continuar normalmente |

---

*Documentación generada para FilApp OS v2.0*
