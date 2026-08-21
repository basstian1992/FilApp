# Checklist de Despliegue — FilApp

Guía paso a paso para desplegar la aplicación con las últimas funcionalidades
(multi-dependencia, analítica, APIs protegidas).

---

## 1. Credenciales de administrador en producción (OBLIGATORIO)

Las APIs del servidor (`/api/usuarios`, `/api/reset`, `/api/reset-stats`,
`/api/auto-close`) usan el SDK de administrador de Firebase y **no funcionan en
producción sin esta variable**. Sin ella:

- El Tótem no puede registrar RUTs nuevos ni resolver nombres.
- La TV no muestra nombres de usuarios registrados.
- El botón "Borrar Datos" del panel admin falla.
- El auto-cierre de turnos trabados no opera.

### Pasos

1. Firebase Console → ⚙️ *Configuración del proyecto* → *Cuentas de servicio*.
2. Click en **Generar nueva clave privada** → descarga el JSON
   (`*-firebase-adminsdk-*.json`). **No lo subas al repositorio.**
3. Abre el JSON y copia su contenido completo como una sola línea.
4. En Vercel → tu proyecto → *Settings* → *Environment Variables* crea:

   | Name                       | Value                                   |
   |----------------------------|-----------------------------------------|
   | `FIREBASE_SERVICE_ACCOUNT` | `{ ...contenido JSON en una línea... }` |

5. Haz **Redeploy** para que la variable surta efecto.

> En desarrollo local no es necesaria: el servidor busca automáticamente un
> archivo `*-firebase-adminsdk-*.json` en la raíz del proyecto.

## 2. Reglas de Firestore

El archivo `firestore.rules` incluye las nuevas colecciones (`sedes`) y deja
`usuarios` solo para clientes autenticados (lo público pasa por las APIs).
Aplicarlas:

```bash
firebase deploy --only firestore:rules
```

Verifica en Firebase Console → Firestore → *Rules* que la versión publicada
incluye `match /sedes/{docId}`.

## 3. Seguridad de las APIs

| API                 | Protección                                                                 |
|---------------------|----------------------------------------------------------------------------|
| `/api/reset-stats`  | ID token de Firebase obligatorio: gerente global o admin dueño de la institución |
| `/api/reset`        | Same-origin (cabecera Origin/Referer del propio sitio)                     |
| `/api/usuarios`     | Same-origin; solo devuelve nombres de usuarios registrados                 |
| `/api/auto-close`   | Same-origin                                                                |

En producción, peticiones externas (curl sin cabeceras del navegador) reciben
`403 Origen no autorizado`.

## 4. Verificación post-despliegue

1. **Tótem**: genera un ticket con un RUT nuevo → debe avanzar sin errores y
   crear el usuario en Firestore (`usuarios/{RUT}` con `institution_id`).
2. **TV**: llama ese turno → debe mostrar el nombre si el usuario está
   registrado con nombre; nunca debe mostrar el RUT.
3. **Panel admin → Pantallas**: verifica que aparecen la Sede Central y cada
   dependencia con sus URLs y contadores en vivo.
4. **Panel admin → Dashboard**: los gráficos reflejan turnos reales; prueba
   "Borrar Datos" escribiendo `BORRAR DATOS` (solo con cuenta autorizada).
5. **Auto-cierre**: llama un turno desde un panel de funcionario, cierra su
   navegador y espera ~16 min (o invoca `/api/auto-close` manualmente) → el
   turno vuelve a la fila.
6. **Multi-dependencia**: emite tickets desde dos Tótems con `&sede=` distinto
   y confirma que los contadores y filas son independientes.

## 5. Notas operativas

- El reinicio diario de contadores ocurre automáticamente a las 07:00 (Chile)
  con el primer ticket del día; el auto-cierre corre mientras haya una TV
  encendida (cada 60 s).
- "Borrar Datos" elimina turnos **y bitácora** de la institución; usuarios,
  funcionarios y dependencias se conservan.
- Si la analítica crece mucho (>10k turnos), considera archivar turnos antiguos
  periódicamente para mantener el dashboard ágil.
