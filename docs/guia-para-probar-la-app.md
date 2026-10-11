# Guía: repartir Stocky para que la gente la pruebe

Cómo armar una **APK para Android** y publicar una **versión web** (sirve
para iPhone), cómo **actualizarlas** y cómo juntar feedback. Ninguna de las
dos necesita que alguien tenga `npx expo start` corriendo en su compu.

> Hacerlo desde la rama que tenga todo lo que se quiere mostrar. Mientras
> la cadena de PRs (#13 → #15 → #16 → #17 → #18) no esté mergeada, eso es
> `feature/cuenta-y-ajustes`, no `main`.

---

## 0. Preparativos (una sola vez)

1. **Cuenta de Expo:** `npx eas-cli login` (la misma cuenta del proyecto
   en expo.dev). Verificar con `npx eas-cli whoami`.
2. **Variables públicas de Supabase para la APK.** El `.env` no se sube a
   EAS (está en `.gitignore`); sin esto la APK no sabe a qué base
   conectarse. Copiar los valores del `.env`:
   ```bash
   npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value "<URL del .env>" --visibility plaintext
   npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<key del .env>" --visibility plaintext
   ```
   Son públicas a propósito (van dentro de la app). **No** cargar acá las
   keys de Gemini/OCR: son secrets de las Edge Functions.
3. **Quién puede iniciar sesión con Google.** Si en Google Cloud Console →
   *Pantalla de consentimiento de OAuth* el estado es **"En prueba"
   (Testing)**, solo pueden entrar las cuentas cargadas como *usuarios de
   prueba* (hasta 100): agregar ahí el mail de cada persona que va a probar.
   La otra opción es **publicar la app** (pasar a "En producción"): con los
   permisos que usa Stocky (nombre y mail) no hace falta la verificación de
   Google, y entra cualquiera.
4. **Formulario de feedback** (ver sección 4): tenerlo armado antes de
   repartir el link.

---

## 1. APK para Android

### Armarla

```bash
npx eas-cli build --profile preview --platform android
```

Tarda unos minutos en los servidores de Expo (el plan gratis tiene cola y un
cupo de builds por mes). Al terminar muestra un **link y un QR**; también
queda en expo.dev → proyecto → Builds.

### Repartirla

- Mandar el **link** de la build (por WhatsApp, mail, etc.). Desde el
  celular: abrir el link → *Install* → descargar la APK → abrirla.
- Android va a pedir permitir **"Instalar apps desconocidas"** para el
  navegador/WhatsApp: es normal, porque no viene de Play Store.
- Si alguien tenía instalado el development build, son apps distintas en
  la práctica: conviene desinstalar el development build si aparece un
  aviso de conflicto.

### Actualizarla (sin volver a repartir la APK)

La APK tiene **EAS Update**: los cambios de código se publican "por aire".

```bash
npx eas-cli update --channel preview --environment preview --message "Qué cambió"
```

La gente lo recibe sola: la app baja la actualización en segundo plano al
abrirse y la aplica **la próxima vez que se abre** (si no aparece, cerrar la
app del todo y abrirla, hasta dos veces).

**Cuándo SÍ hay que armar y repartir una APK nueva** (la actualización por
aire no alcanza): cuando cambia algo nativo — se agrega o actualiza una
librería con código nativo (cámara, audio, notificaciones…), se actualiza
Expo, o se cambia `app.json` (permisos, íconos, nombre, plugins). En ese
caso:

1. Subir `"version"` en `app.json` (por ejemplo de `1.0.0` a `1.0.1`). Así
   las APK viejas no reciben actualizaciones pensadas para la nueva (que
   podrían cerrarse solas): cada versión recibe solo las suyas
   (`runtimeVersion` con la política `appVersion`).
2. `npx eas-cli build --profile preview --platform android` y repartir el
   link nuevo.

Ante la duda: si el cambio fue solo en archivos de `src/` (pantallas,
servicios, textos, estilos), alcanza con `eas update`.

### Limitaciones

- **Notificaciones push con la app cerrada:** necesitan Firebase (ver
  [incidentes-sprint10.md](incidentes-sprint10.md) #1). Sin Firebase
  funcionan igual la campanita, los cartelitos y los avisos de vencimiento
  programados en el celular.

---

## 2. Versión web (sirve para iPhone y computadora)

En iPhone no se pueden instalar APKs, y la App Store/TestFlight requieren
una cuenta de Apple Developer paga. La versión web es gratis y alcanza para
probar.

### Publicarla (EAS Hosting)

```bash
npx expo export --platform web
npx eas-cli deploy
```

- El primer `deploy` pide elegir un nombre: queda una dirección del estilo
  `https://<nombre>--<código>.expo.app` (versión de prueba).
- Para una dirección fija y más corta (`https://<nombre>.expo.app`), cuando
  esté lista para repartir: `npx eas-cli deploy --prod`.
- La exportación web usa el `.env` de la compu desde la que se corre (las
  variables públicas de Supabase), así que hay que tener el `.env` completo.

### Que funcione el login con Google en esa dirección

En Supabase → *Authentication* → *URL Configuration* → *Redirect URLs*,
agregar la dirección publicada con comodín, por ejemplo
`https://<nombre>.expo.app/**` (y la de prueba si se va a usar). Sin esto,
después de elegir la cuenta de Google vuelve a una página que no es la app
(ver [incidentes-sprint1.md](incidentes-sprint1.md) #4).

### En el iPhone

Abrir el link en **Safari** → botón *Compartir* → **"Agregar a pantalla de
inicio"**. Queda un ícono de Stocky que se abre como una app.

### Actualizarla

Volver a correr `npx expo export --platform web` y `npx eas-cli deploy`
(con `--prod` si se usa la dirección fija). La gente ve la versión nueva
al recargar la página o volver a abrir el ícono: no hay que reinstalar nada.

### Limitaciones de la versión web

- **No hay notificaciones push** (expo-notifications no soporta web). La
  campanita y los cartelitos sí funcionan.
- Cámara, galería y voz funcionan desde el navegador (pide permiso).

---

## 3. ¿Cada vez que actualizamos, la gente tiene que descargar algo?

| | Cambios de código (`src/`) | Cambios nativos (librerías, Expo, `app.json`) |
|---|---|---|
| **APK** | No: `eas update` y les llega sola al reabrir la app | Sí: APK nueva (subiendo `version`) |
| **Web** | No: `deploy` y les llega al recargar | No: `export` + `deploy` igual |

---

## 4. Juntar el feedback

- Un **Google Forms** corto, con el link en el mensaje donde se reparte la
  app. Preguntas útiles: qué celular y si usó la APK o la web; qué intentó
  hacer y si lo logró; qué le costó entender; qué falló (con captura de
  pantalla si puede); qué le gustaría que tenga; del 1 al 5, ¿la usaría?
- Pedirles que prueben tareas concretas (crear un hogar, invitar a alguien,
  cargar productos a mano, por ticket y por voz, ver los vencimientos), así
  el feedback es comparable entre personas.
- Lo que reporten como error, cargarlo como incidente
  (`docs/incidentes-sprint*.md`) o como issue de GitHub, con los pasos para
  reproducirlo.

---

## 5. ¿Es seguro EAS Hosting?

Es el hosting oficial de Expo (la empresa detrás de Expo/EAS que ya usa el
proyecto para los builds). Sirve la página por **HTTPS** y lo único que
publica es la app compilada (HTML/JS/imágenes). Lo importante:

- **No publica ningún secreto.** La página lleva la URL de Supabase y la key
  pública ("anon"), que son públicas a propósito y ya van dentro de cualquier
  APK. Las keys de Gemini y OCR viven en los secrets de las Edge Functions
  de Supabase y nunca salen de ahí.
- **La seguridad de los datos no depende del hosting**, depende de Supabase:
  las políticas RLS y las funciones que validan quién puede ver o cambiar
  qué (ver [arquitectura-del-codigo.md](arquitectura-del-codigo.md),
  sección 1). Por eso es igual de seguro que la APK.
- **El link es público:** cualquiera que lo tenga puede abrir la página.
  Para usarla tiene que iniciar sesión con Google, y si la pantalla de
  consentimiento está "En prueba", solo pueden las cuentas cargadas como
  usuarios de prueba (paso 0.3).
