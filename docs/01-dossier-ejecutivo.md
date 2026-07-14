# Dossier Ejecutivo — FilApp OS

## 1. Resumen Ejecutivo

**FilApp OS** es un sistema multiplataforma de gestión de filas y atención ciudadana, diseñado para instituciones públicas y privadas que requieren ordenar, visualizar y optimizar el flujo de atención presencial. Opera sobre una arquitectura cloud nativa con capacidades multi-institución (multi-tenant), notificaciones en tiempo real e integración vía webhook.

## 2. Problema

Las instituciones que atienden público presencialmente enfrentan:

- **Desorden en la sala de espera**: los usuarios no saben cuándo serán atendidos ni a qué módulo dirigirse.
- **Falta de visibilidad**: los funcionarios no tienen una vista clara de los turnos en espera.
- **Sin trazabilidad**: no se registran métricas de tiempo de espera ni de atención.
- **Nulos canales de notificación**: los funcionarios no reciben alertas cuando llegan nuevos pacientes.
- **Costos elevados**: sistemas comerciales de gestión de filas tienen licencias costosas y son difíciles de integrar.

## 3. Solución

FilApp OS entrega un ecosistema completo de cuatro interfaces integradas en tiempo real:

| Interfaz | Usuario | Propósito |
|---|---|---|
| **Tótem** | Paciente | Autoingreso con RUT, selección de trámite, priorización de horas agendadas |
| **Funcionario** | Personal de atención | Cola de espera, llamado, atención y finalización, perfil, WhatsApp |
| **TV** | Sala de espera | Pantalla pública con turno actual, ingresos recientes, historial y voz |
| **Admin/Gerente** | Administración | Configuración, registro de personal, métricas, exportación de datos |

## 4. Arquitectura

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Navegador   │────▶│  Next.js 16  │────▶│   Firebase        │
│  (Cliente)   │     │  (Vercel)    │     │   ─ Firestore     │
└─────────────┘     │  React 19     │     │   ─ Auth          │
                    │  Turbopack    │     └──────────────────┘
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  CallMeBot    │
                    │  (WhatsApp)   │
                    └──────────────┘
                           │
                    ┌──────▼───────┐
                    │  n8n / APIs  │
                    │  (Webhooks)  │
                    └──────────────┘
```

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript.
- **Backend**: Firebase Firestore (base de datos en tiempo real), Firebase Auth.
- **Hosting**: Vercel (edge functions, builds automáticos).
- **Notificaciones**: Webhook (n8n) + WhatsApp (CallMeBot API).
- **Tiempo real**: Firestore `onSnapshot` + Socket.io (funcionalidad mixta).

## 5. Capacidades Multi-Institución

El sistema soporta un número ilimitado de instituciones (municipios, CESFAM, OIRS, etc.), cada una con:

- Configuración propia (nombre, logo, color TV, departamentos).
- Funcionarios independientes con roles y módulos.
- Numeración de tickets separada por institución.
- Base de datos de usuarios segmentada.
- Panel gerencial global con visión consolidada.

## 6. Beneficios Clave

- ⚡ **Tiempo real**: las actualizaciones se reflejan al instante en todas las interfaces.
- 📱 **Sin instalación**: funciona 100% en el navegador, responsive.
- 🔌 **Integrable**: webhook n8n para conectar con sistemas externos (SIG, ficha electrónica, etc.).
- 📊 **Métrica y reportes**: tiempos de espera, atención, exportación CSV.
- 🔐 **Roles**: Gerente (global), Admin (por institución), Funcionario (atención).
- 💰 **Costo cero en licencias**: código propietario desarrollado a medida.

## 7. Roadmap

- [x] Tótem con autoingreso RUT
- [x] Panel funcionario con cola en vivo
- [x] Pantalla TV con voz
- [x] Panel administración/gerencia
- [x] Notificaciones WhatsApp a funcionario
- [x] Recordatorio cada 10 min de turnos en espera
- [ ] Notificaciones WhatsApp a paciente
- [ ] Módulo de estadísticas avanzadas
- [ ] App móvil para funcionarios
- [ ] Integración con sistemas de fichas clínicas

---

*Documento generado el 11 de junio de 2026 — FilApp OS v2.0*
