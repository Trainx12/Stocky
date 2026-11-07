# Integración Arduino-Stocky (temporal)

> **Nombre de la integración:** "INTEGRACIÓN ARDUINO-STOCKY (temporal)".
> Todo el código que agrega tiene este texto en un comentario, para poder
> encontrarlo y borrarlo entero más adelante. **No forma parte de los 10
> sprints planificados del proyecto** (ver `docs/plan-de-testing.md`): es un
> agregado puntual para conectar el dispositivo ESP32-CAM del proyecto
> `esp32_gemini` con el inventario de un hogar de Stocky, pensado desde el
> principio para desactivarse o eliminarse cuando ya no haga falta.

## Qué hace

```
[ESP32 pulsador] -> [Servidor Node (esp32_gemini)] -> [ESP32-CAM]
                            |                              |
                            v                     (devuelve la foto)
            Edge Function arduino-reconocer-foto (Stocky)
                            |
                 Gemini clasifica: ¿ticket o producto?
                            |
              guarda candidatos en candidatos_arduino
              (estado 'pendiente', uno por producto)
                            |
                            v
        App Stocky -> "Candidatos del Arduino" (ArduinoCandidatosScreen)
       el usuario edita nombre/categoría/cantidad y confirma o descarta
                            |
                   "Cargar al hogar" -> crearProducto()
```

Cuando alguien aprieta el pulsador del Arduino, el servidor Node le pide la
foto a la ESP32-CAM y, si esta integración está activa, la manda a la Edge
Function `arduino-reconocer-foto` de Stocky en vez de llamar a Gemini él
mismo. Esa función:

1. Le pide a Gemini que clasifique la foto como **ticket de compra** (varias
   líneas de productos) o **producto suelto**, y que liste los productos
   candidatos en cualquiera de los dos casos.
2. Guarda cada candidato en la tabla `candidatos_arduino` con
   `estado = 'pendiente'`, asociado a un hogar fijo (configurado en el
   servidor Node, no elegido por quien aprieta el botón).
3. Le devuelve al servidor Node un resumen (tipo + cantidad de productos)
   para mostrar en el LCD.

La IA **nunca** crea un producto real directamente: alguien del hogar tiene
que abrir "Candidatos del Arduino" en la app, revisar/corregir lo que
detectó Gemini, y tocar "Cargar al hogar" (ahí sí se llama a `crearProducto`)
o "Descartar". Mismo criterio que `ocr-ticket`/`vencimiento-foto` del resto
de la app.

### "Sacar foto de producto" (sin el dispositivo Arduino)

Mismo flujo, pero sin el hardware: un segundo acceso rápido en Home,
"Sacar foto de producto", abre la cámara del celular/navegador
(`expo-image-picker`) y manda la foto a la **misma** Edge Function
`arduino-reconocer-foto`, autenticado con la sesión del usuario (en vez de
la anon key a mano que usa el servidor Node). Al terminar navega directo a
"Candidatos del Arduino" para confirmar/descartar ahí mismo. Es parte de
esta integración temporal (mismo flag, mismo criterio de eliminación), no
una función aparte.

## Archivos que agrega o toca

### Repo Stocky (este repo)
- `supabase/migrations/20261106120000_integracion_arduino_temporal.sql` —
  tabla `candidatos_arduino` + RLS.
- `supabase/functions/arduino-reconocer-foto/index.ts` — Edge Function
  nueva, independiente de `ocr-ticket`/`vencimiento-foto` (no las toca).
- `src/types/database.ts` — tipo `CandidatoArduino` + entrada
  `candidatos_arduino` en `Database.Tables` (**modificado**, no es archivo
  nuevo).
- `src/config/integracionArduinoTemporal.ts` — flag
  `INTEGRACION_ARDUINO_ACTIVA`.
- `src/services/integracionArduinoTemporal.ts` — listar/confirmar/descartar
  candidatos.
- `src/screens/ArduinoCandidatosScreen.tsx` — pantalla de confirmación.
- `src/types/navigation.ts` — ruta `ArduinoCandidatos` (**modificado**).
- `src/navigation/RootNavigator.tsx` — registra esa pantalla (**modificado**).
- `src/screens/HomeScreen.tsx` — accesos rápidos "Sacar foto de producto" y
  "Candidatos del Arduino", gateados por `INTEGRACION_ARDUINO_ACTIVA`
  (**modificado**).
- `app.json` — plugin `expo-image-picker` con el mensaje de permiso de
  cámara (**modificado**).
- `package.json`/`package-lock.json` — dependencia `expo-image-picker`
  (**modificado**).

### Repo esp32_gemini (servidor Node del Arduino)
- `proyecto/servidor-node/server.js` — rama nueva en `/boton` que, con
  `ARDUINO_INTEGRACION_ACTIVA=1`, manda la foto a la Edge Function en vez de
  a Gemini directo (**modificado**, el flujo original queda intacto detrás
  del flag en `0`).
- `proyecto/servidor-node/.env` — variables nuevas: `ARDUINO_INTEGRACION_ACTIVA`,
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STOCKY_HOGAR_ID` (**modificado**).
- `proyecto/LEEME.md` — sección "Integración con Stocky (temporal)"
  (**modificado**).

Todos los comentarios de estos archivos arrancan con
`INTEGRACIÓN ARDUINO (temporal)` o `INTEGRACIÓN ARDUINO-STOCKY (temporal)`
para poder buscarlos (`grep -rn "INTEGRACIÓN ARDUINO"`).

## Cómo activarla

1. En Stocky: aplicar la migración y desplegar la Edge Function
   (`supabase db push`, `supabase functions deploy arduino-reconocer-foto`),
   con el secret `GEMINI_API_KEY` ya configurado (`supabase secrets set
   GEMINI_API_KEY=...`) — `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los
   provee Supabase automáticamente a toda Edge Function, no hace falta
   configurarlos a mano.
2. Confirmar que `INTEGRACION_ARDUINO_ACTIVA` en
   `src/config/integracionArduinoTemporal.ts` esté en `true` (es el default).
3. En el servidor Node (`esp32_gemini/proyecto/servidor-node/.env`), poner
   `ARDUINO_INTEGRACION_ACTIVA=1` y completar `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` (Project Settings > API, es pública) y
   `STOCKY_HOGAR_ID` (id del hogar al que se cargan los productos).

## Cómo desactivarla (temporalmente, sin borrar nada)

- **Ocultarla en la app**: poner `INTEGRACION_ARDUINO_ACTIVA = false` en
  `src/config/integracionArduinoTemporal.ts`. El acceso rápido y la
  pantalla de candidatos dejan de ser alcanzables desde la UI (la tabla,
  la Edge Function y los datos ya guardados no se tocan).
- **Volver el Arduino a su comportamiento original**: poner
  `ARDUINO_INTEGRACION_ACTIVA=0` en `servidor-node/.env`. El servidor vuelve
  a llamar a Gemini directo, exactamente como antes de esta integración.

## Cómo eliminarla del todo

Cuando ya no haga falta ni como opción desactivada:

**En Stocky** (en una rama nueva, con su propio PR — ver `AGENTS.md`):
1. `supabase migration` para dropear la tabla:
   `drop table if exists public.candidatos_arduino;` (o revertir la
   migración `20261106120000_integracion_arduino_temporal.sql` y borrarla).
2. `supabase functions delete arduino-reconocer-foto` y borrar la carpeta
   `supabase/functions/arduino-reconocer-foto/`.
3. Borrar `src/config/integracionArduinoTemporal.ts`,
   `src/services/integracionArduinoTemporal.ts` y
   `src/screens/ArduinoCandidatosScreen.tsx`.
4. En `src/types/database.ts`: borrar `CandidatoArduino` y sus tipos
   asociados (`TipoCandidatoArduino`, `ConfianzaCandidatoArduino`,
   `EstadoCandidatoArduino`) y la entrada `candidatos_arduino` de
   `Database.Tables`.
5. En `src/types/navigation.ts`: borrar la ruta `ArduinoCandidatos`.
6. En `src/navigation/RootNavigator.tsx`: borrar el import y el
   `<AppStack.Screen name="ArduinoCandidatos" .../>`.
7. En `src/screens/HomeScreen.tsx`: borrar el import de
   `INTEGRACION_ARDUINO_ACTIVA` y de `expo-image-picker`, los botones "Sacar
   foto de producto"/"Candidatos del Arduino", `handleIrACandidatosArduino`,
   `handleSacarFotoProducto`, el estado `sacandoFoto` y el prop `loading` de
   `QuickAccessButton` si no lo usa nadie más.
8. Desinstalar `expo-image-picker` (`npm uninstall expo-image-picker`) y
   quitar su entrada de `app.json` (`plugins`), si no se usa en otro lado.
9. Borrar este archivo (`docs/integracion-arduino-temporal.md`).

**En esp32_gemini**:
1. En `server.js`: borrar el bloque `ARDUINO_INTEGRACION_ACTIVA` (la
   constante, la función `enviarAStocky` y la rama `if
   (ARDUINO_INTEGRACION_ACTIVA)` del handler `/boton`, dejando solo la rama
   `else` como código normal).
2. En `.env`: borrar las cuatro variables de la sección "INTEGRACIÓN
   ARDUINO-STOCKY (temporal)".
3. En `LEEME.md`: borrar la sección "Integración con Stocky (temporal)".

Una búsqueda de `grep -rn "INTEGRACIÓN ARDUINO" .` en ambos repos antes de
cerrar el PR de eliminación confirma que no quedó nada suelto.
