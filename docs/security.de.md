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

Die Erweiterung meldet nur über den eigenen Anmeldedienst von Autodarts an. Sie liest
nie einen Token oder ein Passwort von einer anderen Website, und der einzige Code, der
die gespeicherte Sitzung der Seite berührt, ist `extension/content.js`.

## Vertrauensgrenzen

1. **Der gemeinsame Computer.** Jede Person am Display kann zu jedem gespeicherten
   Konto wechseln; genau darum geht es. Ein gespeicherter Token oder ein Passwort ist
   so sicher wie der Computer und das Browserprofil, in dem er liegt.
2. **Erweiterung → Autodarts.** Token und Passwörter gehen nur an `autodarts.com`,
   über HTTPS. Nichts geht anderswohin, und nichts wird protokolliert.
3. **Die Autodarts-Seite ↔ der Wechsler darin.** Der Wechsler, den die Seite zeigt,
   ist `switcher.html`, eine Seite der Erweiterung in einem Rahmen: ein anderer
   Ursprung als die Seite, darum können die Skripte der Seite die Konten nicht daraus
   lesen, und er sitzt in einem geschlossenen Shadow Root. Nur diese Seite ist von außen
   abrufbar, und nur für `play.autodarts.com` und `play.autodarts.io`. Das
   Content-Skript in der Seite erfährt nur Name und Bild des Spielers auf dem Knopf,
   nie einen Token oder ein Passwort, und der Service Worker nimmt eine Anfrage, die
   Konten zu sehen oder zu ändern, nur von einer Seite der Erweiterung an, nicht vom
   Content-Skript.

## Bedrohungen und Gegenmaßnahmen

| Bedrohung | Gegenmaßnahme |
| --- | --- |
| Ein Token geht an die falsche Stelle | Anfragen gehen nur an `api.autodarts.com`; die Liste der Hosts im Manifest ist auf Autodarts beschränkt |
| Ein veralteter Token wird wieder benutzt und sperrt ein Konto aus | Die Erweiterung behält immer den Token, den der Server zuletzt zurückgab (Rotation), und erneuert geparkte Token im Hintergrund; jede Änderung der Konten läuft einzeln nacheinander in einer Warteschlange des Service Workers, darum schicken weder ein Doppeltipp noch die Erneuerung denselben Token zweimal |
| Ein Passwort wird gespeichert, obwohl das niemand wollte | Ein Passwort wird nur nach einem ausdrücklichen „Passwort merken“ behalten; das ist von Haus aus aus und lässt sich wieder vergessen |
| Eine Anmeldung am Display wird gespeichert, ohne dass jemand darum gebeten hat | Eine neue Sitzung wird nur in den zehn Minuten nach „Konto hinzufügen“ oder der Installation von selbst gespeichert, nur einmal und nur, solange kein gespeichertes Konto spielt; ein abgelaufenes Zeitfenster schließt sich für immer, und „Abbrechen“ im Popup oder im Wechsler schließt es früher. Jede andere Sitzung wartet auf „Konto speichern“ |
| Die Sitzung der Seite wird unerwartet angefasst | Nur `content.js` liest oder schreibt sie, nur unter dem Schlüssel `autodarts_refresh_token`, nur auf `play.autodarts.com` |
| Ein Wechsel landet in einem verborgenen Tab, oder ein anderer Autodarts-Tab spielt als das vorige Konto weiter und verbraucht dessen Token | Ein Wechsel geht an den Autodarts-Tab, der im zuletzt benutzten Fenster zu sehen ist, und jeder andere Autodarts-Tab lädt neu, sobald sich die Sitzung in der Seite geändert hat, darum behält kein Tab das vorige Konto im Speicher |
| Eine Seite, die gerade startet, erneuert ihre Sitzung, während die Erweiterung sie parkt | Antwortet kein Tab, öffnet die Erweiterung einen oder lädt einen neu und wartet, bis die Seite die Sitzung erneuert hat, mit der sie gestartet ist, darum parkt sie den frischen Token des vorigen Spielers und keinen verbrauchten |
| Die Erweiterung sieht mehr vom Browser, als sie braucht | Sie fragt nicht nach der Berechtigung `tabs`: Sie findet die Autodarts-Tabs über ihren Host-Zugriff und fragt nur nach ihnen, und der Browser gibt ihr Adresse und Titel keines anderen Tabs |
| Die Skripte der Autodarts-Seite lesen die gespeicherten Konten aus dem Wechsler | Der Wechsler ist eine Seite der Erweiterung in einem Rahmen eines anderen Ursprungs, in einem geschlossenen Shadow Root; das Content-Skript bekommt vom Service Worker nur den Spieler auf dem Knopf |
| Ein Wechsel während eines Matches beendet es unerwartet | Auf einer Match-Seite lehnt der Service Worker einen Wechsel oder eine Abmeldung ab, bis die Person bestätigt, bevor er einen Token verbraucht |

## Verbleibende Risiken

- Ein gespeicherter Token oder ein Passwort ist nur so gut geschützt wie der Computer
  und das Browserprofil, in dem er liegt; diese Erweiterung ist für einen vertrauten,
  gemeinsamen Rechner gedacht, nicht für einen öffentlichen.
- Die Autodarts-Seite kann erkennen, dass die Erweiterung installiert ist, am Knopf
  und an `switcher.html`, das sie laden darf. Eine Seite, die es darauf anlegt, könnte
  den Wechsler auch unter einen Köder legen und einen Tipp darauf erschleichen; dazu
  bräuchte es ein Skript von Autodarts selbst, das die Sitzung des Spielers in der
  Seite ohnehin schon hat.
- Die Anmeldung von Autodarts ist keine veröffentlichte Schnittstelle. Eine Änderung
  auf ihrer Seite kann die Erweiterung stoppen, bis sie angepasst ist, und könnte
  ändern, wie lange ein geparkter Token gültig bleibt.

Maßgeblich ist die englische Fassung, die der Sprachumschalter oben zeigt.
