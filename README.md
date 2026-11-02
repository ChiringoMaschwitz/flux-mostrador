# flux-mostrador

Venta al paso sin cajero: el cliente escanea el QR, elige, paga y recibe un número; al pizzero se le imprime la comanda.
Primer local: **Una Pizza** (martes a sábado de 13 a 17).

App aparte de FLUX: repo y proyecto de Vercel propios. Usa la misma base de Supabase pero con su propio esquema
(`alpaso`) y un usuario de base (`alpaso_app`) que **no puede ver ni tocar nada de FLUX**.

## Qué hay (Etapa 1, modo prueba)

| Dirección | Qué es |
|---|---|
| `/` | La página del cliente: carta, mitad y mitad, armá tu docena, pedido. En modo prueba **no cobra**: guarda el pedido y da el número. |
| `/panel` | El panel con PIN: carta (editar, alta de productos y secciones, fotos, orden), agotados, horario y abrir/cerrar, pedidos de hoy, historial, usuarios (solo Gerencia). |

Etapas que siguen: 2 cobro con Mercado Pago · 3 comandera · 4 factura B con ARCA · 5 ventas en FLUX.

## Puesta en marcha (una sola vez)

### 1. La base (Supabase → SQL Editor)

1. Pegá y corré todo `sql/alpaso_fase1a.sql`. Crea el esquema, el usuario `alpaso_app` y carga la carta de Una Pizza.
2. En una consulta nueva, corré estas dos líneas cambiando lo que está en mayúsculas:

   ```sql
   alter role alpaso_app password 'UNA_CLAVE_LARGA';
   select alpaso.crear_usuario('Guillermo', 'gerencia', 'TU_PIN');
   ```

   - La clave: solo letras y números (sin `@ : / ? #`), 20 caracteres o más. La vas a necesitar en el paso 2.
   - El PIN: de 4 a 6 números. Es el que usás para entrar al panel (podés poner el mismo de Gerencia de FLUX).
   - El Controlador lo creás después desde el panel, en **Usuarios**.

### 2. Vercel (proyecto nuevo `flux-mostrador`)

1. **Add New → Project** → importar `ChiringoMaschwitz/flux-mostrador`. Sin framework, sin comando de build.
2. **Settings → Environment Variables** (marcá *Production* y *Preview*):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La misma conexión que usa FLUX (pooler, puerto 6543), cambiando **el usuario** por `alpaso_app.<ref>` (el `<ref>` es lo que va después de `postgres.` en el usuario actual) y **la contraseña** por la clave del paso 1. |
   | `SESION_SECRETO` | Cualquier frase larga inventada, de 32 caracteres o más. Firma las sesiones del panel. |

3. **Storage → Create → Blob** y conectalo al proyecto: agrega solo `BLOB_READ_WRITE_TOKEN` (para subir fotos desde el panel).
4. **Redeploy** después de cargar las variables.

### 3. Probar

1. Entrá a `/panel`, elegí tu nombre y poné tu PIN.
2. En **Horario**, tocá **Abrir ahora** (fuera de horario la página no toma pedidos).
3. Abrí `/` en el celu, armá un pedido y confirmalo: te da el número y muestra la comanda que se va a imprimir.
4. En el panel, **Pedidos** muestra los de hoy. Al terminar, volvé **Horario → Según horario**.

## Reglas de negocio

- Precios siempre recalculados en el servidor (`lib/pedido.js`); el celular no decide precios.
- **Mitad y mitad**: solo grandes de secciones con "Mitad y mitad". Se cobra la grande del gusto más caro. Comanda: `GRANDE MITAD Y MITAD` + cada ½.
- **Empanadas**: se eligen por gusto y se cobra la combinación más barata de sueltas, ½ docenas y docenas.
- **Agotado**: se marca a mano y vuelve solo cuando alguien lo desmarca.
- **Se vende al paso**: un producto puede quedar cargado (para la carta del local) sin aparecer en la ventana. Así están los postres, las cervezas de litro y la copa de vino.
- **Usuarios**: Gerencia hace todo; Controlador maneja carta, precios, agotados y horario. PIN de 4 a 6 números; 5 intentos mal → 15 minutos bloqueado. Sesión de 8 horas.
- Todo cambio queda en el **historial** (quién, cuándo, antes y después).

## Archivos

- `index.html` — página del cliente (sin React, misma arquitectura que la carta de la Focacceria).
- `panel/index.html` — panel.
- `api/carta.js`, `api/pedido.js` — públicos. `api/panel/{sesion,ver,accion,foto}.js` — con sesión.
- `lib/` — base (`db`), sesión y PIN (`sesion`), horario, carta, armado del pedido, cambios del panel.
- `sql/alpaso_fase1a.sql` — esquema, usuario restringido y carta inicial (idempotente).
- `assets/` — logo y fotos iniciales (las nuevas se suben al Blob desde el panel).
