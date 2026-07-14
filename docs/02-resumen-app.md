# Resumen de la Aplicación — FilApp OS

## ¿Qué es FilApp?

FilApp OS es un sistema web de gestión de filas y atención ciudadana para instituciones que atienden público. Reemplaza los sistemas tradicionales de tickets (como los display numéricos) con una plataforma moderna, conectada y en tiempo real.

## ¿Qué problema resuelve?

Cuando una persona llega a una institución (municipio, CESFAM, OIRS), actualmente:
1. Toma un número físico y espera sin saber cuánto falta.
2. El funcionario no sabe quién sigue hasta que mira el ticket.
3. No hay registro de cuánto esperó cada persona.

FilApp digitaliza todo el proceso: la persona ingresa con su RUT en un tótem, el funcionario ve la cola en su panel, la pantalla TV anuncia el turno, y todo queda registrado.

## Interfaces

### 1. Tótem (Autoatención)
Pantalla táctil donde el usuario:
- Ingresa su RUT (chileno o extranjero).
- Selecciona el tipo de trámite.
- Si tiene hora agendada, selecciona el funcionario.
- Recibe un ticket visual con número y módulo.
- El turno aparece automáticamente en el panel del funcionario correspondiente.

### 2. Panel Funcionario
Vista principal del personal de atención:
- Cola de espera con prioridad (horas agendadas primero).
- Botón "Llamar Siguiente" para llamar al próximo turno.
- Panel de turno activo con datos del paciente.
- Botones para finalizar o saltar turno.
- Vinculación de WhatsApp para recibir notificaciones de nuevos turnos.
- Recordatorios automáticos cada 10 minutos si hay turnos esperando.
- Historial del paciente y formulario de registro de datos.
- Exportación de atenciones a CSV.

### 3. Pantalla TV
Vista pública para la sala de espera:
- Muestra el turno actual siendo atendido.
- Indica a qué módulo dirigirse.
- Lista de ingresos recientes con RUT.
- Historial de últimos llamados.
- Narración por voz del turno actual.
- Configurable con logo, color y nombre de la institución.
- Soporte 4K.

### 4. Panel de Administración
Gestión de la institución:
- Dashboard con KPIs (turnos en espera, atendidos hoy, tiempos promedio).
- Configuración de TV, logo, colores, departamentos.
- Registro de funcionarios con credenciales.
- Aprobación de cuentas pendientes.
- Exportación de base de datos de usuarios y turnos a CSV.

### 5. Panel Gerencial (Global)
Visión consolidada de todas las instituciones:
- Lista de instituciones con estado.
- Registro de administradores.
- Reportes globales y exportación.
- Reset total del sistema.

## Tecnología

- **Plataforma**: Web (responsive, funciona en cualquier navegador moderno).
- **Infraestructura**: 100% cloud (Vercel + Firebase).
- **Tiempo real**: Las actualizaciones se reflejan al instante sin recargar.
- **Notificaciones**: WhatsApp (vía CallMeBot) para alertar al funcionario.
- **Seguridad**: Autenticación Firebase, Firestore Rules por colección.

## URLs del Sistema

- Producción: `https://filapp-two.vercel.app`
- TV: `https://filapp-two.vercel.app/tv?institution=ID`
- Tótem: `https://filapp-two.vercel.app/totem?institution=ID`

---

*FilApp OS v2.0 — Desarrollado por www.asesoriapublica.cl*
