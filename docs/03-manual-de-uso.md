# Manual de Uso — FilApp OS

## Índice

1. [Registro y Primer Acceso](#1-registro-y-primer-acceso)
2. [Tótem (Autoatención)](#2-tótem-autoatención)
3. [Panel Funcionario](#3-panel-funcionario)
4. [Pantalla TV](#4-pantalla-tv)
5. [Panel Administrador](#5-panel-administrador)
6. [Panel Gerencial](#6-panel-gerencial)
7. [WhatsApp](#7-whatsapp)
8. [Solución de Problemas](#8-solución-de-problemas)

---

## 1. Registro y Primer Acceso

### 1.1 Crear una Institución (Admin)
1. Ingrese a `https://filapp-two.vercel.app`.
2. Seleccione **"Crear Nueva Institución"**.
3. Complete el formulario: nombre de administrador, correo, contraseña, nombre de institución.
4. Una vez registrado, será redirigido al panel de administración.

### 1.2 Unirse a una Institución (Funcionario)
1. En la página principal, seleccione la institución desde **"Unirme a una Institución"**.
2. Complete sus datos: nombre, correo, contraseña.
3. Su cuenta quedará **pendiente** hasta que un administrador la apruebe.
4. Recibirá un toast cuando sea aprobado y será redirigido automáticamente.

### 1.3 Iniciar Sesión
1. Use el formulario de inicio de sesión en la página principal.
2. Ingrese su correo y contraseña.
3. Será redirigido según su rol: Admin → `/admin`, Funcionario → `/funcionarios`.

---

## 2. Tótem (Autoatención)

### 2.1 Acceso
- URL: `https://filapp-two.vercel.app/totem?institution=ID_INSTITUCION`
- O desde el panel de administración, botón **"Tótem"**.

### 2.2 Ingreso por RUT
1. La pantalla muestra un campo para ingresar RUT.
2. Escriba el RUT chileno (con guión, ej: 12345678-9) o extranjero.
3. Presione **"Ingresar"** o la tecla Enter.

### 2.3 Selección de Trámite (OIRS Directo)
1. Si el modo OIRS directo está activo, seleccione la categoría del trámite.
2. Confirme para generar el ticket.

### 2.4 Horas Agendadas (Appointment)
1. Si tiene hora agendada, seleccione el modo **"Hora Agendada"**.
2. Seleccione el funcionario con quien tiene la cita.
3. Confirme para generar el ticket prioritario.

### 2.5 Ticket
- Una vez generado, verá su número, letra de módulo y departamento.
- El turno aparece automáticamente en la cola del funcionario.
- La pantalla vuelve al inicio después de 20 segundos.

---

## 3. Panel Funcionario

### 3.1 Acceso
- URL: `https://filapp-two.vercel.app/funcionarios`
- Requiere iniciar sesión con cuenta de funcionario.

### 3.2 Interfaz Principal

#### Barra Superior
- **Avatar**: foto de perfil (click para cambiar URL).
- **Nombre**: del funcionario.
- **Institución**: nombre y logo.
- **Cargo y Departamento**: información del perfil.
- **Módulo**: letra de atención asignada (click para editar).
- **Estado**: indicador verde (activo) / rojo (inactivo) — click para alternar.

#### Panel Izquierdo — Cola de Espera
- **Número de pacientes en espera** (grande).
- **Lista de turnos** (máximo 8 visibles).
- Los turnos con hora agendada aparecen con distintivo 📅 y prioridad alta.
- **Botón "Llamar Siguiente"**: llama al próximo turno de la cola.
- **Ingreso Manual**: campo para ingresar RUT manualmente y crear un turno directo.

#### Panel Derecho — Turno Activo
- **Nombre del paciente** (o RUT si no se encontró el nombre).
- **Número de turno y RUT**.
- Indicador de **Hora Agendada** o **Atención General**.
- **Historial del paciente**: atenciones anteriores.
- **Formulario de datos**: permite registrar/editar datos del paciente.
- **Botón "Finalizar Atención"**: marca el turno como atendido.
- **Botón "Saltar"**: marca el turno como no presentado.

### 3.3 Flujo de Atención
1. Espere que lleguen turnos (desde tótem o ingreso manual).
2. Presione **"Llamar Siguiente"**.
3. El paciente ve su turno en la pantalla TV y escucha el anuncio.
4. Atienda al paciente y complete el formulario si es necesario.
5. Presione **"Finalizar Atención"** para liberar y pasar al siguiente.

### 3.4 Vinculación WhatsApp
- En la sección inferior del panel, complete:
  - **Teléfono**: número con código de país (ej: 56912345678).
  - **API Key**: clave de CallMeBot.
- Presione **"Vincular WhatsApp y Probar"**.
- Recibirá un mensaje de prueba en su WhatsApp.
- A partir de ese momento, recibirá notificaciones de:
  - Nuevos turnos en su módulo.
  - Recordatorios cada 10 minutos si hay pacientes esperando.

### 3.5 Exportación
- En el panel de historial, puede exportar las atenciones del día a CSV.

---

## 4. Pantalla TV

### 4.1 Acceso
- URL: `https://filapp-two.vercel.app/tv?institution=ID_INSTITUCION`
- No requiere autenticación.
- Se abre recomendadamente en una ventana/tab independiente.

### 4.2 Display
- **Encabezado**: logo, nombre de institución, mensaje del día, reloj.
- **Tarjeta central**: muestra el turno actual siendo atendido.
  - Nombre del paciente (o RUT si está disponible).
  - Módulo al que debe dirigirse.
  - Número de turno.
  - Funcionario que atiende.
- **Barra de Ingresos**: lista de turnos que acaban de ingresar.
- **Historial**: últimos turnos llamados.

### 4.3 Voz
- Cuando se llama un nuevo turno, el sistema anuncia automáticamente:
  "Atención. Siguiente turno, letra X, número Y. Diríjase al módulo Z."
- La voz se selecciona automáticamente en español.

### 4.4 Temas
- **Oscuro** (default) y **Claro**.
- Se ajusta según la configuración del sistema o preferencia del navegador.

### 4.5 Configuración desde Admin
- Nombre en TV.
- Logo, color primario, fondo personalizado.
- Mensaje del día.

---

## 5. Panel Administrador

### 5.1 Acceso
- URL: `https://filapp-two.vercel.app/admin`
- Requiere cuenta con rol `admin` o `gerente`.

### 5.2 Dashboard
- **KPIs**: turnos en espera, atendidos hoy, tiempo promedio de espera y atención.
- **Estado del personal**: lista de funcionarios con su estado actual.
- **Reinicio de conteo**: pone el contador de tickets en 0 (con registro de quién y cuándo).

### 5.3 Configuración
- **TV**: nombre mostrado, URL del logo, color primario, URL de fondo, mensaje del día.
- **Departamentos**: lista separada por comas (ej: OIRS, Atención General, Tesorería).
- **Departamento OIRS**: cuál se usa para trámites directos.
- **Webhook n8n**: URL para enviar eventos a sistemas externos.

### 5.4 Funcionarios
- **Registrar**: nombre, correo, contraseña, departamento, cargo, módulo.
- **Lista**: tabla con todos los funcionarios, su estado y módulo.
- **Editar**: departamento, cargo, módulo.
- **Eliminar**: elimina permanentemente el perfil.
- **Pendientes**: aprueba o rechaza solicitudes de registro.

### 5.5 Base de Datos (Directorio)
- Lista de todos los usuarios registrados en la institución.
- Búsqueda por RUT o nombre.

### 5.6 Reportes
- Exportación a CSV:
  - Usuarios de la institución.
  - Turnos (con estado, fechas, funcionario).
  - Funcionarios (con datos de perfil).

---

## 6. Panel Gerencial

### 6.1 Acceso
- Cuentas especiales con email autorizado (`b.alarconatenas@gmail.com` o `contacto@asesoriapublica.cl`).

### 6.2 Funcionalidades Exclusivas
- **Instituciones**: crear, autorizar (activar instituciones pendientes), gestionar, eliminar.
- **Administradores**: registrar administradores, asignarlos a instituciones, eliminarlos.
- **Reportes globales**: descargar base de datos completa del sistema o por institución.
- **Reset total del sistema**: elimina todas las instituciones, usuarios y turnos (requiere confirmación escribiendo "BORRAR TODO").

---

## 7. WhatsApp

### 7.1 ¿Cómo funciona?
El sistema se integra con **CallMeBot** para enviar mensajes WhatsApp al funcionario.

### 7.2 Configuración
1. Obtenga una API Key de CallMeBot (https://www.callmebot.com/blog/free-api-whatsapp-messages/).
2. En el panel de funcionario, ingrese su número (ej: 56912345678) y la API Key.
3. Presione **"Vincular WhatsApp y Probar"**.
4. Si recibe el mensaje de prueba, la configuración es correcta.

### 7.3 Tipos de Notificaciones
| Evento | Mensaje |
|---|---|
| Nuevo turno | "Se ha solicitado un nuevo turno en tu módulo de [departamento]. Turno: X-42. Personas en cola: 3" |
| Recordatorio (10 min) | "El turno X-42 lleva más de 10 minutos esperando en [departamento]. Personas en cola: 3" |
| Alta prioridad | Las horas agendadas incluyen distintivo 🔔 ALTA PRIORIDAD |

### 7.4 Límites
- **CoolDown**: máximo 1 mensaje cada 35 segundos por número.
- **Recordatorios**: máximo 1 cada 10 minutos por turno.

---

## 8. Solución de Problemas

| Problema | Causa | Solución |
|---|---|---|
| No llegan WhatsApp | API Key incorrecta o número mal formateado | Verifique en CallMeBot, use formato 569XXXXXXXX |
| La TV no muestra pacientes | `usuarios` requiere auth | El RUT se muestra si está en el turno; el nombre requiere iniciar sesión |
| Tótem no avanza | Error de conexión a Firestore | Verifique conexión a internet, recargue la página |
| Funcionario no ve turnos | Índice compuesto faltante | Revise Firebase Console → Firestore → Índices |
| Error "Too many requests" | Límite de CallMeBot excedido | Espere 1 minuto antes de enviar más mensajes |
| Cuenta pendiente | Admin no ha aprobado | Contacte al administrador de su institución |
| No veo el panel Admin | No tiene permisos | Solo roles `admin` y `gerente` pueden acceder |

---

*Documento generado el 11 de junio de 2026 — FilApp OS v2.0*
