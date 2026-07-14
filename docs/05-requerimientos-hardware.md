# Requerimientos de Hardware — FilApp OS

## 1. Tótem de Autoatención

### 1.1 Función
Pantalla táctil donde el usuario ingresa su RUT, selecciona trámite y recibe su ticket. Opera 100% en el navegador, sin software adicional.

### 1.2 Especificaciones

| Especificación | Mínimo | Recomendado |
|---|---|---|
| **Pantalla** | 15.6" táctil capacitiva | 21.5" – 32" táctil capacitiva |
| **Resolución** | 1280×720 | 1920×1080 (Full HD) |
| **Tipo táctil** | Resistiva | **Capacitiva multipunto** (precisa, responsiva) |
| **Procesador** | Celeron / N4000 | Core i3 / Ryzen 3 o superior |
| **RAM** | 4 GB | 8 GB |
| **Almacenamiento** | 32 GB eMMC | 64 GB SSD o superior |
| **SO** | Windows 10/11, Linux, ChromeOS | Windows 10/11 Pro o Linux Lite |
| **Navegador** | Chrome 90+ / Edge 90+ | **Chrome** (mejor compatibilidad) |
| **Conexión** | WiFi 5 | **Ethernet** (más estable para tiempo real) |
| **Audio** | No requerido | Parlante integrado (opcional, para feedback sonoro) |

### 1.3 Modos de Equipo Recomendados

#### Opción A: All-in-One Táctil (Recomendado)
Equipo integrado tipo POS o quiosco interactivo.
- **Ventajas**: robusto, diseño profesional, fácil de instalar.
- **Ejemplos**: Positivo BGH All-in-One Touch, Hikvision Touch, Diebold Nixdorf.
- **Costo estimado**: $400.000 – $800.000 CLP.

#### Opción B: Tablet Grande
Tablet de 10"–13" montada en soporte.
- **Ventajas**: bajo costo, fácil de reemplazar.
- **Desventajas**: menor durabilidad, riesgo de robo, batería que degrada.
- **Requerimiento**: modo kiosko permanente (Fully Kiosk Browser en Android).
- **Costo estimado**: $150.000 – $350.000 CLP.

#### Opción C: PC + Monitor Táctil
PC estándar + monitor táctil externo.
- **Ventajas**: componentes modulares y reemplazables.
- **Desventajas**: más cables, ocupa más espacio.
- **Costo estimado**: $300.000 – $600.000 CLP.

### 1.4 Periféricos Opcionales

| Periférico | Uso | Costo estimado |
|---|---|---|
| **Impresora térmica 58mm** | Imprimir ticket físico (USB) | $40.000 – $80.000 CLP |
| **Lector QR/código de barras** | Escaneo rápido de RUT | $25.000 – $60.000 CLP |
| **Soporte mural o pedestal** | Fijar el tótem | $50.000 – $150.000 CLP |

---

## 2. Pantalla TV (Sala de Espera)

### 2.1 Función
Muestra en vivo el turno siendo atendido, ingresos recientes e historial. Incluye narración por voz.

### 2.2 Especificaciones

| Especificación | Mínimo | Recomendado |
|---|---|---|
| **Pantalla** | 32" LED/LCD | **43" – 65" LED/LCD** |
| **Resolución** | 1920×1080 (Full HD) | **3840×2160 (4K)** — soporte nativo |
| **Procesador** | Smart TV con navegador | **Mini PC** + TV (mayor rendimiento) |
| **RAM (Mini PC)** | 2 GB | 4 GB o superior |
| **SO (Mini PC)** | Windows / Linux / ChromeOS | Windows 10/11 o Linux |
| **Navegador** | Chrome 90+ / Edge 90+ | Chrome en modo kiosko |
| **Conexión** | WiFi 5 | **Ethernet** (streaming continuo) |
| **Audio** | Parlante integrado del TV | Parlante externo o barra de sonido |
| **Orientación** | Horizontal (paisaje) | Horizontal (paisaje) |

### 2.3 Modos de Equipo Recomendados

#### Opción A: Smart TV + Navegador (Mínimo)
- Usar el navegador web integrado del TV.
- **Ventajas**: sin hardware extra.
- **Desventajas**: la síntesis de voz puede no funcionar, el rendimiento del navegador es limitado, algunos Smart TV no soportan kiosko.
- **Costo estimado**: $250.000 – $500.000 CLP (solo el TV).

#### Opción B: TV + Mini PC (Recomendado)
- TV estándar + Mini PC económico.
- **Ventajas**: máxima compatibilidad (voz incluida), soporta 4K, Chrome en kiosko, más durable.
- **Mini PC recomendado**: Beelink N95 / Intel NUC / Minisforum — desde $100 USD.
- **Costo estimado**: $300.000 – $600.000 CLP (TV + Mini PC).

#### Opción C: TV + Chromebox
- TV + Chromebox con ChromeOS.
- **Ventajas**: kiosko nativo, actualizaciones automáticas, seguro.
- **Costo estimado**: $350.000 – $700.000 CLP.

---

## 3. Estación de Funcionario

### 3.1 Función
PC para que el funcionario gestione la cola, llame turnos, atienda pacientes y registre datos.

### 3.2 Especificaciones

| Especificación | Mínimo | Recomendado |
|---|---|---|
| **Pantalla** | 13" laptop | 22" monitor o monitor dual |
| **Resolución** | 1366×768 | 1920×1080 |
| **Procesador** | Celeron / Core i3 | Core i5 / Ryzen 5 |
| **RAM** | 4 GB | 8 GB |
| **Almacenamiento** | 64 GB | 128 GB SSD |
| **SO** | Windows / macOS / Linux | Windows 10/11 Pro |
| **Navegador** | Chrome 90+, Edge 90+ | Chrome |
| **Conexión** | WiFi | **Ethernet** |
| **Audio** | Parlante integrado | Auriculares o parlante (para sonido de nuevo turno) |

### 3.3 Notas
- Cualquier PC moderna funciona, el sistema es 100% web.
- Se recomienda **monitor dual**: un monitor para el panel de funcionario, el otro mostrando la pantalla TV (para que el funcionario vea lo que ve el público).

---

## 4. Resumen de Equipamiento por Institución

| Equipo | Cantidad | Costo unitario (CLP) | Total (CLP) |
|---|---|---|---|
| Tótem touch all-in-one | 1–2 | $500.000 | $500.000 – $1.000.000 |
| TV 50" + Mini PC | 1–3 | $450.000 | $450.000 – $1.350.000 |
| PC funcionario | 1–10 | $350.000 | $350.000 – $3.500.000 |
| Switch red + cables | 1 | $50.000 | $50.000 |
| **Total estimado** | | | **$1.350.000 – $5.900.000** |

---

## 5. Requerimientos de Red e Instalación

| Aspecto | Requisito |
|---|---|
| **Velocidad de internet** | 5 Mbps mínimo, **20 Mbps recomendado** |
| **Latencia** | <100 ms a Firebase (us-east1) |
| **Estabilidad** | Conexión permanente (caídas interrumpen tiempo real) |
| **Puertos** | Solo HTTPS 443 — no requiere puertos abiertos adicionales |
| **Firewall** | Permitir: `*.firebaseio.com`, `*.vercel.app`, `api.callmebot.com` |
| **WiFi vs Ethernet** | WiFi 2.4/5 GHz funciona; **Ethernet recomendado** para TV y tótem |
| **DNS** | Recomendado: Google DNS (8.8.8.8) o Cloudflare (1.1.1.1) |
| **Cableado HDMI** | Para TV + Mini PC: cable HDMI 2.0 (4K) de 1–3 m |
| **Alimentación** | Regulador de voltaje / UPS para equipos críticos |

---

## 6. Configuración de Kiosko (Pantalla Completa)

Para terminales de uso público sin intervención del usuario, configurar el navegador en modo kiosko:

### Windows + Chrome
```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://filapp-two.vercel.app/totem?institution=ID" --disable-pinch --overscroll-history-navigation=0
```

### Windows + Edge
```bat
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk "https://filapp-two.vercel.app/totem?institution=ID" --edge-kiosk-type=fullscreen --disable-pinch
```

### Linux + Chromium
```bash
chromium-browser --kiosk "https://filapp-two.vercel.app/totem?institution=ID" --no-first-run --disable-pinch
```

### Android (Tablet tótem)
Usar app de kiosko como **Fully Kiosk Browser** o **Kiosk Browser Lockdown** desde Play Store.

> **Nota**: La aplicación web también intenta entrar en pantalla completa automáticamente al cargar (vía Fullscreen API). Si el navegador lo bloquea por políticas de seguridad, aparecerá un botón flotante para activarlo manualmente.

---

## 7. Matriz de Decisión Rápida

| Si necesitas... | Elige... |
|---|---|
| Máxima durabilidad y aspecto profesional | All-in-One táctil para tótem + TV con Mini PC |
| Menor costo posible | Tablet + Smart TV con navegador |
| Buena calidad/precio | All-in-One táctil + TV 50" + Mini PC N95 |
| Función de voz en TV obligatoria | TV + Mini PC (Smart TV NO soporta speech synthesis) |
| Impresión de ticket | Tótem All-in-One + impresora térmica USB |

---

*Documento generado el 11 de junio de 2026 — FilApp OS v2.0*
