<!-- The spelling check knows English and German only. cspell:disable -->

# Ficha de Chrome Web Store (español)

## Nombre

Player Switch for Autodarts

## Descripción breve (132 caracteres como máximo)

Cambia entre cuentas de Autodarts en una pantalla compartida con un solo toque, sin volver a iniciar sesión.

## Descripción detallada

Comparte una sola pantalla de Autodarts en el pasillo, el club o el bar, y deja que
cada uno juegue con su propia cuenta.

Player Switch for Autodarts guarda el inicio de sesión de varias cuentas en el
ordenador y cambia entre ellas con un solo toque — sin escribir contraseñas, sin
cerrar sesión y volver a entrar.

Cómo funciona:

• Guarda cada cuenta una vez: después de «Añadir cuenta», el siguiente inicio de
  sesión en Autodarts se guarda solo. Un toque en una tarjeta pone esa cuenta en
  la diana.
• La cuenta que deja su sitio sigue con la sesión iniciada, así que un toque la
  trae de vuelta al instante.
• Las cuentas aparcadas se mantienen listas en segundo plano, así que siguen
  funcionando días después.
• Pensado para la pantalla de la diana: un botón redondo en la página de Autodarts
  y el atajo Alt+Mayús+O muestran los jugadores sobre la página, también en
  pantalla completa y en modo quiosco, en tarjetas grandes para una pantalla
  táctil. Las teclas del 1 al 9 eligen un jugador.
• En la página de una partida en curso, un cambio pregunta primero, para que una
  partida nunca termine por sorpresa.
• Para un club o un bar, opcional y desactivado de serie: un PIN de gestión
  protege «Gestionar cuentas» y los ajustes, cada jugador puede proteger su cuenta
  con un PIN propio y, tras una pausa, la pantalla vuelve sola a una cuenta de la
  casa, nunca durante una partida. La extensión no guarda ningún PIN, solo un hash
  con sal.
• Opcional: deja que la extensión recuerde una contraseña, y vuelve a iniciar la
  sesión de una cuenta por sí sola si su sesión deja de funcionar. Las cuentas que
  inician sesión con Google o Apple no pueden usarlo, porque no tienen una
  contraseña de Autodarts que recordar.

Todo se queda en tu ordenador. La extensión solo habla con Autodarts, no recoge
estadísticas y no envía nada a nadie más. La política de privacidad da los
detalles.

La página de ayuda, en inglés, explica cada mensaje de la extensión y enlaza una
guía para una pantalla de diana en modo quiosco que arranca con el ordenador.

Sin relación con Autodarts.

## Justificación de los permisos

• storage — para guardar tus cuentas, sus sesiones y los ajustes en tu ordenador,
  en el modo para clubs y bares también los hashes con sal de los PIN.
• alarms — para renovar las sesiones aparcadas en segundo plano, de modo que sigan
  listas, y en el modo para clubs y bares para comprobar una vez por minuto si la
  pantalla debe volver tras una pausa.
• scripting — para llevar el botón de una versión nueva a las pestañas de
  Autodarts que ya están abiertas al actualizarse la extensión, o a una que ha
  dejado de responder, de modo que una pantalla en modo quiosco siga funcionando
  sin recargar. Solo ejecuta el script propio de la extensión, solo en
  play.autodarts.com.
• unlimitedStorage — para que Chrome nunca borre la clave que sella tus sesiones
  y contraseñas guardadas cuando el disco se llena. Sin ella, cada cuenta aparcada
  tendría que volver a iniciar sesión.
• Recurso accesible desde la Web switcher.html, solo para play.autodarts.com — los
  jugadores que el botón de la página de Autodarts muestra sobre la página. Es una
  página de la extensión en un marco, así que los scripts de la página de
  Autodarts no pueden leer de ella las cuentas guardadas.
• Acceso al host play.autodarts.com — para llevar una sesión a la página de
  Autodarts y sacarla de ella, mostrar allí el botón y encontrar las pestañas de
  Autodarts abiertas, de modo que un cambio tenga efecto en la de delante y las
  demás se recarguen. La extensión no puede leer la dirección ni el título de
  otras pestañas.
• Acceso al host api.autodarts.com — para iniciar sesión, renovar una sesión y
  cerrarla, las mismas peticiones que hace la web de Autodarts. La extensión no se
  conecta a ningún otro servidor, y su política de seguridad de contenido lo
  impone.

## Página principal y asistencia

La tienda toma las direcciones de la página principal y de la asistencia una sola
vez para todos los idiomas, de [`listing.en.md`](listing.en.md#homepage-and-support-urls).
La web existe en inglés y en alemán; las páginas en inglés valen también para esta
ficha.

## Categoría

Productividad

## Propósito único

Cambiar la cuenta de Autodarts con la sesión iniciada en una pantalla compartida
sin volver a iniciar sesión.

## Imágenes

Esta ficha muestra las imágenes en inglés, los archivos `.en` de [`images/`](images/), generados por `bash scripts/screenshots.sh`; [la guía de versiones](../docs/releases.md#the-images-of-the-store) dice qué hueco del panel lleva cada archivo.
