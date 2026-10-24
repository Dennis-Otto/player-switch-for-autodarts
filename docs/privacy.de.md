# Datenschutzerklärung

Player Switch for Autodarts ist eine Browsererweiterung, mit der sich mehrere
Personen ein Display teilen und zwischen ihren Autodarts-Konten wechseln. Diese
Erklärung sagt, womit sie umgeht. Sie ist kurz, weil die Erweiterung fast nichts
erhebt.

## Was sie speichert, und wo

Alles, was die Erweiterung behält, bleibt im Browser auf deinem eigenen Computer, im
lokalen Speicher der Erweiterung (`chrome.storage.local`). Es geht nie an den
Entwickler oder an Dritte.

- **Ein Sitzungs-Token von Autodarts für jedes gespeicherte Konto**, damit ein Konto
  ohne neue Anmeldung wieder spielen kann. Die Erweiterung erneuert diese Token bei
  Autodarts.
- **Benutzername und Passwort, nur für Konten, bei denen du „Passwort merken“
  einschaltest.** Sie werden gespeichert, damit die Erweiterung dieses Konto wieder
  anmelden kann, falls sein Token nicht mehr geht. Das ist von Haus aus aus, und du
  kannst es jederzeit wieder entfernen.
- **Die Einstellungen des Knopfs auf der Autodarts-Seite:** ob er zu sehen ist, und
  in welcher Ecke.
- **Die Zeit der letzten Erneuerung**, und ob Autodarts dabei alle Konten abgewiesen
  hat, damit die Erweiterung nachholen kann, was sie verpasst hat, während der
  Computer aus war, und dir sagen kann, wann sie vielleicht ein Update braucht.
- **Bis wann gerade ein neues Konto hinzugefügt wird**, zehn Minuten lang nach
  „Konto hinzufügen“ oder der Installation, damit die nächste Anmeldung auf Autodarts
  von selbst gespeichert wird.

## Wohin Daten gehen

Die Erweiterung spricht nur mit Autodarts (`api.autodarts.com` und
`play.autodarts.com`), über HTTPS, um anzumelden, eine Sitzung zu erneuern und die
Sitzung zwischen Konten zu verschieben — dieselben Anfragen, die die Autodarts-Website
selbst stellt. Sie öffnet keine andere Verbindung, spricht mit keinem Dienst für
Statistiken oder Tracking, und der Entwickler bekommt keine Daten von ihr.

„Hilfe“ und „Problem melden“ im Popup und auf der Willkommensseite öffnen die
Website der Erweiterung und ihr Fehlerformular auf GitHub in einem neuen Tab. In das
Fehlerformular trägt sie die Version der Erweiterung und den Namen und die
Hauptversion des Browsers ein, und sonst nichts; GitHub bekommt es erst, wenn du das
Formular selbst abschickst.

## Was sie nicht tut

- Sie erhebt keine Statistiken, Nutzungsdaten oder Telemetrie.
- Sie liest oder speichert nichts von anderen Websites als Autodarts.
- Sie kann Adresse und Titel deiner anderen Tabs und deinen Browserverlauf nicht
  lesen. Sie fragt nicht nach der Berechtigung `tabs`, darum gibt ihr der Browser die
  Adresse eines Tabs nur für die Autodarts-Seiten, und sie fragt nur nach den Tabs,
  in denen Autodarts offen ist, damit ein Wechsel im vorderen passieren kann und die
  anderen neu laden.
- Sie gibt keine Daten weiter und verkauft keine.

## Deine Kontrolle

Entfernst du ein Konto in der Erweiterung, löscht sie seinen gespeicherten Token und
ein gemerktes Passwort. Entfernst du die Erweiterung, löscht der Browser alles, was
sie gespeichert hat.

## Kontakt

Fragen zum Datenschutz: Eröffne ein Issue unter
<https://github.com/Dennis-Otto/player-switch-for-autodarts/issues> oder schreib an die
Adresse in [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md).
Maßgeblich ist die englische Fassung, die der Sprachumschalter oben zeigt.
