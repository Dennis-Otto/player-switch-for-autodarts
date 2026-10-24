# Sicherheitsdesign

Was Player Switch for Autodarts schützt, wem es vertraut und welche Risiken bleiben.
[SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md)
sagt, wie du eine Sicherheitslücke meldest und wie du ein Release prüfst.

## Was es ist

Eine Browsererweiterung, die die Anmeldung mehrerer Autodarts-Konten auf einem
Computer behält, damit ein gemeinsames Display mit einem Tipp zwischen ihnen wechseln
kann. Sie ist für einen Bildschirm gedacht, den sich die Menschen eines Haushalts
teilen und dem sie vertrauen.

## Was sie behält, und wo

Alles behält der Browser auf dem einen Computer, in `chrome.storage.local`, und es
verlässt ihn nie, außer an Autodarts selbst:

- **Ein Sitzungs-Token pro Konto** (der rotierende Refresh-Token von Autodarts). Die
  Erweiterung erneuert ihn, damit ein geparktes Konto später spielen kann, und schickt
  ihn nur an `api.autodarts.com`.
- **Ein Passwort, nur wenn du sie darum bittest.** „Passwort merken“ speichert
  Benutzername und Passwort eines Kontos, damit die Erweiterung das Konto wieder
  anmelden kann, wenn sein Token nicht mehr geht. Es liegt als Klartext in
  `chrome.storage.local`, wie der Token, und geht nur an
  `api.autodarts.com/auth/v1/login`. Lass es aus, und kein Passwort wird je
  gespeichert.
- **Die Einstellungen des Knopfs in der Seite:** ob er zu sehen ist, und in welcher
  Ecke.
- **Wann die Erneuerung zuletzt lief,** und ob Autodarts dabei jedes geparkte Konto
  abgewiesen hat, damit die Erweiterung eine Erneuerung nachholt, die sie verpasst hat,
  während der Computer aus war, und ein Update von sich selbst vorschlagen kann. Das
  enthält keinen Token und keinen Namen.
- **Nur nach dem Wechsel zurück auf eine ältere Version: eine Kopie der gespeicherten
  Konten**, die eine neuere Version in einem Format gespeichert hat, das diese nicht
  lesen kann, unter `accounts.backup`, mit ihren Tokens und gemerkten Passwörtern.
  Diese Version speichert nie über solche Konten; die Kopie ist eine zweite
  Absicherung. Sie wird gelöscht, sobald wieder eine Version läuft, die die Konten
  liest, und mit der Erweiterung.

Nur die Erweiterung selbst kann diesen Speicher lesen: ihr Service Worker und ihre
eigenen Seiten, das Popup, die Optionsseite und der Wechsler. Chrome lässt auch die
Content-Skripte einer Erweiterung `chrome.storage.local` lesen, wenn die Erweiterung
nichts anderes sagt, darum beschränkt der Service Worker ihn bei jedem seiner Starts
auf die eigenen Kontexte der Erweiterung (`TRUSTED_CONTEXTS`). `content.js`, das in
der Autodarts-Seite läuft, kann keinen Token und kein Passwort lesen, auch dann
nicht, wenn jemand den Prozess der Seite übernähme.

Die Erweiterung meldet nur über den eigenen Anmeldedienst von Autodarts an. Sie liest
nie einen Token oder ein Passwort von einer anderen Website, und der einzige Code, der
die gespeicherte Sitzung der Seite berührt, ist `extension/content.js`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/data-flow.de.dark.svg">
  <img src="images/diagrams/data-flow.de.svg" alt="Wohin die Daten gehen: Alles bleibt im Browser auf diesem Computer. Das Popup und der Umschalter fragen den Service Worker, der in chrome.storage.local einen Token pro Konto behält, ein Passwort nur, wenn eines gemerkt ist, die Einstellungen des Knopfs, die Zeit der letzten Erneuerung, ob Autodarts dabei jedes Konto abgewiesen hat, und bis wann ein neues Konto hinzugefügt wird. Er bringt eine Sitzung in die Autodarts-Seite und liest die ausgehende nur über content.js aus ihr, das einzige Skript, das die Sitzung im localStorage der Seite liest oder schreibt. Um einen Token zu erneuern, mit einem Passwort anzumelden oder eine Sitzung zu beenden, spricht er über HTTPS mit api.autodarts.com, demselben Dienst, den die Autodarts-Seite selbst nutzt. Das Popup und der Umschalter zeigen das Bild jedes Spielers von der Adresse, die Autodarts dafür angibt. Sonst geht nichts irgendwohin: kein Server des Entwicklers, keine Statistiken; Hilfe und Problem melden öffnen nur eine Seite in einem neuen Tab.">
</picture>

## Vertrauensgrenzen

1. **Der gemeinsame Computer.** Jede Person am Display kann zu jedem gespeicherten
   Konto wechseln; genau darum geht es. Ein gespeicherter Token oder ein Passwort ist
   so sicher wie der Computer und das Browserprofil, in dem er liegt.
2. **Erweiterung → Autodarts.** Token und Passwörter gehen nur an
   `api.autodarts.com`, über HTTPS. Nichts geht anderswohin, und nichts wird
   protokolliert. Die Content Security Policy der Erweiterung setzt das durch: Ihre
   Seiten und ihr Service Worker führen nur die eigenen Skripte der Erweiterung aus
   und verbinden sich nur mit `api.autodarts.com`, darum sperrt der Browser eine
   Anfrage an jeden anderen Host.
3. **Die Autodarts-Seite ↔ der Wechsler darin.** Der Wechsler, den die Seite zeigt,
   ist `switcher.html`, eine Seite der Erweiterung in einem Rahmen: ein anderer
   Ursprung als die Seite, darum können die Skripte der Seite die Konten nicht daraus
   lesen, und er sitzt in einem geschlossenen Shadow Root. Nur diese Seite ist von außen
   abrufbar, und nur für `play.autodarts.com`. Das Content-Skript in der Seite erfährt
   nur Name und Bild des Spielers auf dem Knopf, nie einen Token oder ein Passwort, und
   kann den Speicher nicht lesen. Der Service Worker nimmt eine Anfrage, die Konten zu
   sehen oder zu ändern, nur von einer Seite dieser Erweiterung an, nach der ID und der
   Adresse des Absenders, nicht vom Content-Skript, das nur fragen darf, was sein Knopf
   zeigt. Das Content-Skript nimmt seinerseits nur Anfragen dieser Erweiterung an und
   schreibt in die Sitzung der Seite nur einen Token.
4. **Das Manifest.** Die Erweiterung fragt nach den Berechtigungen `storage`,
   `alarms` und `scripting` und nach Zugriff auf `play.autodarts.com` und
   `api.autodarts.com`, und nach nichts sonst. [`store/permissions.json`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/permissions.json)
   nennt jede mit ihrem Grund, und `scripts/check-manifest.mjs` lässt eine Änderung
   scheitern, die nach mehr fragt. `play.autodarts.io` leitet jede Adresse an
   `play.autodarts.com` weiter, darum zeigt sich nie eine Seite davon, und die
   Erweiterung fragt nach keinem Zugriff darauf.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/who-reaches-the-accounts.de.dark.svg">
  <img src="images/diagrams/who-reaches-the-accounts.de.svg" alt="Wer an die gespeicherten Konten kommt: Die gespeicherten Konten mit ihren Tokens und gemerkten Passwörtern liegen in chrome.storage.local, das nur die eigenen Kontexte der Erweiterung lesen können, der Service Worker und ihre Seiten: das Popup, die Optionsseite und der Wechsler in seinem Rahmen. content.js läuft in der Autodarts-Seite und kann den Speicher nicht lesen. Es darf den Service Worker nur fragen, was sein Knopf zeigt, nimmt Anfragen nur von dieser Erweiterung an und schreibt in die Sitzung der Seite nur einen Token. Der Service Worker nimmt eine Anfrage, die Konten zu sehen oder zu ändern, nur von einer Seite dieser Erweiterung an. Seine Content Security Policy lässt ihn nur mit api.autodarts.com verbinden, und der Browser sperrt jeden anderen Host.">
</picture>

## Bedrohungen und Gegenmaßnahmen

| Bedrohung | Gegenmaßnahme |
| --- | --- |
| Ein Token geht an die falsche Stelle | Anfragen gehen nur an `api.autodarts.com`; die Liste der Hosts im Manifest ist auf Autodarts beschränkt, und die Content Security Policy lässt den Browser eine Anfrage an jeden anderen Host sperren |
| Eine Seite, deren Prozess jemand übernommen hat, liest die gespeicherten Tokens und Passwörter über das Content-Skript | Bei jedem seiner Starts beschränkt der Service Worker `chrome.storage.local` auf die eigenen Kontexte der Erweiterung, darum kann das Content-Skript ihn nicht lesen; es bekommt nur den Spieler auf dem Knopf |
| Das Content-Skript, oder eine Seite, die es übernommen hat, schickt eine Anfrage, die die Konten liest oder Spieler wechselt | Der Service Worker nimmt eine solche Anfrage nur von einer Seite dieser Erweiterung an, nach der ID und der Adresse des Absenders; das Content-Skript nimmt nur Anfragen dieser Erweiterung an |
| Ein veralteter Token wird wieder benutzt und sperrt ein Konto aus | Die Erweiterung behält immer den Token, den der Server zuletzt zurückgab (Rotation), und erneuert geparkte Token im Hintergrund; jede Änderung der Konten läuft einzeln nacheinander in einer Warteschlange des Service Workers, darum schicken weder ein Doppeltipp noch die Erneuerung denselben Token zweimal |
| Ein Passwort wird gespeichert, obwohl das niemand wollte | Ein Passwort wird nur nach einem ausdrücklichen „Passwort merken“ behalten; das ist von Haus aus aus und lässt sich wieder vergessen |
| Eine Anmeldung am Display wird gespeichert, ohne dass jemand darum gebeten hat | Eine neue Sitzung wird nur in den zehn Minuten nach „Konto hinzufügen“ oder der Installation von selbst gespeichert, nur einmal und nur, solange kein gespeichertes Konto spielt; ein abgelaufenes Zeitfenster schließt sich für immer, und „Abbrechen“ im Popup oder im Wechsler schließt es früher. Jede andere Sitzung wartet auf „Konto speichern“ |
| Die Sitzung der Seite wird unerwartet angefasst | Nur `content.js` liest oder schreibt sie, nur unter dem Schlüssel `autodarts_refresh_token`, nur auf `play.autodarts.com`, und es schreibt nur einen Token, nie einen anderen Wert |
| Anderer Code als `content.js` läuft in der Autodarts-Seite, etwa wenn die Erweiterung ihr Skript nach einem Update oder in einem Tab, der nicht mehr antwortet, noch einmal ausführt | `chrome.scripting` führt nur die mitgelieferte Datei `content.js` aus, über ihren Namen, nie zur Laufzeit erzeugten Code, und nur im Hauptframe eines Tabs von `play.autodarts.com`, worauf der Host-Zugriff es beschränkt. Eine Kopie, die ein Update abgeschnitten hat, erreicht weder die Erweiterung noch den Speicher, und die neue Kopie läuft einmal pro Seite, darum antwortet ein Tab, der sie zweimal bekommt, nur einmal |
| Nach einem stillen Update der Erweiterung antwortet die Seite nicht mehr, und ein Display zeigt „Autodarts öffnen“, bis jemand es neu lädt | Jede Installation und jedes Update führt das neue `content.js` in den offenen Autodarts-Tabs aus, und ein Tab, dessen Skript auf eine Anfrage nicht antwortet, bekommt es noch einmal, bevor die Erweiterung diesen Tab als letzten Ausweg neu lädt |
| Ein Wechsel landet in einem verborgenen Tab, oder ein anderer Autodarts-Tab spielt als das vorige Konto weiter und verbraucht dessen Token | Ein Wechsel geht an den Autodarts-Tab, der im zuletzt benutzten Fenster zu sehen ist, und jeder andere Autodarts-Tab lädt neu, sobald sich die Sitzung in der Seite geändert hat, darum behält kein Tab das vorige Konto im Speicher |
| Eine Seite, die gerade startet, erneuert ihre Sitzung, während die Erweiterung sie parkt | Antwortet kein Tab, öffnet die Erweiterung einen oder lädt einen neu und wartet, bis die Seite die Sitzung erneuert hat, mit der sie gestartet ist, darum parkt sie den frischen Token des vorigen Spielers und keinen verbrauchten |
| Die Erweiterung sieht mehr vom Browser, als sie braucht | Sie fragt nicht nach der Berechtigung `tabs`: Sie findet die Autodarts-Tabs über ihren Host-Zugriff und fragt nur nach ihnen, und der Browser gibt ihr Adresse und Titel keines anderen Tabs |
| Die Skripte der Autodarts-Seite lesen die gespeicherten Konten aus dem Wechsler | Der Wechsler ist eine Seite der Erweiterung in einem Rahmen eines anderen Ursprungs, in einem geschlossenen Shadow Root; das Content-Skript bekommt vom Service Worker nur den Spieler auf dem Knopf |
| Ein Wechsel während eines Matches beendet es unerwartet | Auf einer Match-Seite lehnt der Service Worker einen Wechsel oder eine Abmeldung ab, bis die Person bestätigt, bevor er einen Token verbraucht |
| Eine Änderung fügt eine Berechtigung oder einen Host hinzu, und nach dem Update schaltet Chrome die Erweiterung auf einem Kiosk-Display ab, bis jemand die neue Warnung annimmt | `scripts/check-manifest.mjs` lässt `scripts/check.sh` scheitern, solange `store/permissions.json` die Berechtigung nicht mit ihrem Grund erlaubt und nicht beide Store-Einträge sie begründen. Es lehnt auch `externally_connectable` ab, optionale Berechtigungen, ein Content-Skript in der Welt der Seite und eine Content Security Policy, die Skripte von anderswo ausführt |
| Ein älterer Browser installiert die Erweiterung und scheitert dann im Betrieb | Das Manifest verlangt Chrome 140 oder neuer (`minimum_chrome_version`), die erste Version, in der `chrome.storage.local.setAccessLevel` die Konten vor dem Content-Script verbirgt; `scripts/check-manifest.mjs` scheitert an einer niedrigeren |

## Verbleibende Risiken

- Ein gespeicherter Token oder ein Passwort ist nur so gut geschützt wie der Computer
  und das Browserprofil, in dem er liegt; diese Erweiterung ist für einen vertrauten,
  gemeinsamen Rechner gedacht, nicht für einen öffentlichen.
- Die Autodarts-Seite kann erkennen, dass die Erweiterung installiert ist, am Knopf
  und an `switcher.html`, das sie laden darf. Eine Seite, die es darauf anlegt, könnte
  den Wechsler auch unter einen Köder legen und einen Tipp darauf erschleichen; dazu
  bräuchte es ein Skript von Autodarts selbst, das die Sitzung des Spielers in der
  Seite ohnehin schon hat.
- Wo ein Browser den Speicher nicht auf die eigenen Kontexte der Erweiterung
  beschränken kann, schreibt der Service Worker das in seine Konsole in
  `chrome://extensions`, und `content.js` liest weiterhin selbst nichts aus dem
  Speicher.
- Die Anmeldung von Autodarts ist keine veröffentlichte Schnittstelle. Eine Änderung
  auf ihrer Seite kann die Erweiterung stoppen, bis sie angepasst ist, und könnte
  ändern, wie lange ein geparkter Token gültig bleibt.

Maßgeblich ist die englische Fassung, die der Sprachumschalter oben zeigt.
