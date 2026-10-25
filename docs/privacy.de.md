# Datenschutzerklärung

Player Switch for Autodarts ist eine Browsererweiterung, mit der sich mehrere
Personen ein Display teilen und zwischen ihren Autodarts-Konten wechseln. Diese
Erklärung sagt, womit sie umgeht. Sie ist kurz, weil die Erweiterung fast nichts
erhebt.

## Was sie speichert, und wo

Alles, was die Erweiterung behält, bleibt im Browser auf deinem eigenen Computer, im
lokalen Speicher der Erweiterung (`chrome.storage.local`). Es geht nie an den
Entwickler oder an Dritte. Nur die Erweiterung selbst kann es lesen, nicht die
Autodarts-Seite und nicht das Skript, das die Erweiterung in dieser Seite ausführt.

- **Ein Sitzungs-Token von Autodarts für jedes gespeicherte Konto**, damit ein Konto
  ohne neue Anmeldung wieder spielen kann. Die Erweiterung erneuert diese Token bei
  Autodarts.
- **Benutzername und Passwort, nur für Konten, bei denen du „Passwort merken“
  einschaltest.** Sie werden gespeichert, damit die Erweiterung dieses Konto wieder
  anmelden kann, falls sein Token nicht mehr geht. Das ist von Haus aus aus, und du
  kannst es jederzeit wieder entfernen.
- **Ein Schlüssel, der die Tokens und Passwörter verschlüsselt,** in der eigenen
  Datenbank der Erweiterung im Browser (IndexedDB). Die Tokens und Passwörter werden
  nur verschlüsselt gespeichert, nie im Klartext, und der Browser gibt den Schlüssel
  nie heraus, auch nicht an die Erweiterung. Geht der Schlüssel verloren, etwa weil
  die Daten der Erweiterung gelöscht wurden, melden sich die Konten einmal neu an,
  und die gemerkten Passwörter sind vergessen. Das
  [Sicherheitsdesign](security.de.md#versiegelte-tokens-und-passwörter) erklärt die
  Einzelheiten.
- **Die Einstellungen des Knopfs auf der Autodarts-Seite:** ob er zu sehen ist, und
  in welcher Ecke.
- **Nur im Modus für Verein und Kneipe, sobald du ihn einschaltest:** ein gesalzener
  Hash der Manager-PIN und der PIN jedes Spielers, nie eine PIN selbst, die Länge der
  Pause und das Hauskonto. Solange der Browser läuft, und nur solange die Rückkehr
  nach einer Pause an ist, auch die Zeit des letzten Tippens, Klicks oder Tastendrucks
  auf der Autodarts-Seite: nie wo oder was es war. Der Browser vergisst diese Zeit,
  und die Zahl der falschen PINs, wenn er schließt.
- **Die Zeit der letzten Erneuerung**, und ob Autodarts dabei alle Konten abgewiesen
  hat, damit die Erweiterung nachholen kann, was sie verpasst hat, während der
  Computer aus war, und dir sagen kann, wann sie vielleicht ein Update braucht.
- **Bis wann gerade ein neues Konto hinzugefügt wird**, zehn Minuten lang nach
  „Konto hinzufügen“ oder der Installation, damit die nächste Anmeldung auf Autodarts
  von selbst gespeichert wird.
- **Nur nach dem Wechsel zurück auf eine ältere Version der Erweiterung: eine Kopie
  der gespeicherten Konten**, die die neuere Version in einem Format gespeichert hat,
  das die ältere nicht lesen kann, damit sie nicht verloren gehen. Sie wird gelöscht,
  sobald wieder eine Version läuft, die sie liest, und wenn du die Erweiterung entfernst.

## Wohin Daten gehen

Die Erweiterung spricht nur mit Autodarts (`api.autodarts.com` und
`play.autodarts.com`), über HTTPS, um anzumelden, eine Sitzung zu erneuern und die
Sitzung zwischen Konten zu verschieben — dieselben Anfragen, die die Autodarts-Website
selbst stellt. Das Popup und der Umschalter zeigen auch das Bild jedes Spielers von der
Adresse, die Autodarts dafür angibt, wie die Autodarts-Website. Sie öffnet keine
andere Verbindung, spricht mit keinem Dienst für Statistiken oder Tracking, und der
Entwickler bekommt keine Daten von ihr. Ihre Content Security Policy lässt sie nur mit
`api.autodarts.com` verbinden, darum sperrt der Browser selbst jede andere Verbindung.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/data-flow.de.dark.svg">
  <img src="images/diagrams/data-flow.de.svg" alt="Wohin die Daten gehen: Alles bleibt im Browser auf diesem Computer. Das Popup und der Umschalter fragen den Service Worker, der in chrome.storage.local einen Token pro Konto behält, ein Passwort nur, wenn eines gemerkt ist, die Einstellungen des Knopfs, die Zeit der letzten Erneuerung, ob Autodarts dabei jedes Konto abgewiesen hat, und bis wann ein neues Konto hinzugefügt wird. Er bringt eine Sitzung in die Autodarts-Seite und liest die ausgehende nur über content.js aus ihr, das einzige Skript, das die Sitzung im localStorage der Seite liest oder schreibt. Um einen Token zu erneuern, mit einem Passwort anzumelden oder eine Sitzung zu beenden, spricht er über HTTPS mit api.autodarts.com, demselben Dienst, den die Autodarts-Seite selbst nutzt. Das Popup und der Umschalter zeigen das Bild jedes Spielers von der Adresse, die Autodarts dafür angibt. Sonst geht nichts irgendwohin: kein Server des Entwicklers, keine Statistiken; Hilfe und Problem melden öffnen nur eine Seite in einem neuen Tab.">
</picture>

„Hilfe“ und „Problem melden“ im Popup und auf der Willkommensseite öffnen die
Website der Erweiterung und ihr Fehlerformular auf GitHub in einem neuen Tab. In das
Fehlerformular trägt sie die Version der Erweiterung und den Namen und die
Hauptversion des Browsers ein, und sonst nichts; GitHub bekommt es erst, wenn du das
Formular selbst abschickst.

## Was sie nicht tut

- Sie erhebt keine Statistiken, Nutzungsdaten oder Telemetrie. Die Zeit der letzten
  Eingabe auf der Autodarts-Seite, im Modus für Verein und Kneipe, bleibt auf dem
  Computer und entscheidet nur, wann das Display nach einer Pause zurückkehrt.
- Sie liest oder speichert nichts von anderen Websites als Autodarts.
- Sie kann Adresse und Titel deiner anderen Tabs und deinen Browserverlauf nicht
  lesen. Sie fragt nicht nach der Berechtigung `tabs`, darum gibt ihr der Browser die
  Adresse eines Tabs nur für die Autodarts-Seiten, und sie fragt nur nach den Tabs,
  in denen Autodarts offen ist, damit ein Wechsel im vorderen passieren kann und die
  anderen neu laden.
- Sie gibt keine Daten weiter und verkauft keine.

## Deine Kontrolle

Entfernst du ein Konto in der Erweiterung, beendet sie zuerst seine Sitzung bei
Autodarts, mit derselben Abmeldung, die die Autodarts-Website schickt, und löscht dann
seinen gespeicherten Token und ein gemerktes Passwort. Ist Autodarts nicht erreichbar,
löscht sie das Konto trotzdem, das Popup sagt es, und die Sitzung bei Autodarts endet,
wenn sie abläuft.

„Alle Konten vergessen“ unter „Konten verwalten“ tut das für jedes Konto, auch für das
auf der Seite angemeldete, und löscht dann alles, was die Erweiterung gespeichert hat:
die Konten, den Schlüssel, der sie verschlüsselt, die Einstellungen und die PINs für
Verein und Kneipe.

Entfernst du die Erweiterung, löscht der Browser ebenfalls alles, was sie gespeichert
hat, aber das beendet keine Sitzung bei Autodarts. Wähle darum zuerst „Alle Konten
vergessen“, wenn ein Display den Besitzer wechselt.

## Kontakt

Fragen zum Datenschutz: Eröffne ein Issue unter
<https://github.com/Dennis-Otto/player-switch-for-autodarts/issues> oder schreib an die
Adresse in [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md).
Maßgeblich ist die englische Fassung, die der Sprachumschalter oben zeigt.
