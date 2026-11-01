# Chrome-Web-Store-Eintrag (Deutsch)

## Name

Player Switch for Autodarts

## Short description

Wechsle an einem gemeinsamen Display mit einem Tipp zwischen Autodarts-Konten, ohne dich neu anzumelden.

## Ausführliche Beschreibung

Ein Autodarts-Display im Flur, im Verein oder in der Kneipe, und trotzdem spielt
jede Person unter ihrem eigenen Konto.

Player Switch for Autodarts speichert die Anmeldung mehrerer Konten auf dem
Computer und wechselt mit einem einzigen Tipp zwischen ihnen — ohne Passwort
einzutippen, ohne Ab- und wieder Anmelden.

So funktioniert es:

• Jedes Konto einmal speichern: Nach „Konto hinzufügen“ wird die nächste Anmeldung
  auf Autodarts von selbst gespeichert. Ein Tipp auf eine Kachel bringt das Konto
  aufs Board.
• Das Konto, das Platz macht, bleibt angemeldet und kommt mit einem Tipp zurück.
• Geparkte Konten werden im Hintergrund bereitgehalten und gehen auch Tage später
  noch.
• Gemacht fürs Board-Display: Ein runder Knopf auf der Autodarts-Seite und das
  Tastenkürzel Alt+Umschalt+O zeigen die Spieler direkt über der Seite, auch im
  Vollbild und im Kiosk-Modus, in großen Kacheln für einen Touchscreen. Die Tasten
  1 bis 9 wählen einen Spieler.
• Auf der Seite eines laufenden Matches fragt ein Wechsel vorher, damit ein Match
  nie aus Versehen endet.
• Für Verein und Kneipe, optional und von Haus aus aus: Eine Manager-PIN schützt
  „Konten verwalten“ und die Einstellungen, jeder Spieler kann sein Konto mit einer
  eigenen PIN schützen, und nach einer Pause kehrt das Display von selbst zu einem
  Hauskonto zurück, nie während eines Matches. Die Erweiterung speichert keine PIN,
  nur einen gesalzenen Hash davon.
• Optional: Die Erweiterung merkt sich ein Passwort und meldet ein Konto von selbst
  neu an, falls die Sitzung einmal nicht mehr geht. Konten, die sich mit Google oder
  Apple anmelden, können das nicht nutzen, weil sie kein Autodarts-Passwort haben,
  das sich die Erweiterung merken könnte.
• Ein entferntes Konto wird auch bei Autodarts abgemeldet, und „Alle Konten
  vergessen“ leert das Display, bevor es den Besitzer wechselt.

Alles bleibt auf deinem Computer. Die Erweiterung spricht nur mit Autodarts, sammelt
keine Statistiken und schickt nichts an Dritte. Details in der Datenschutzerklärung.

Die Support-Seite erklärt jede Meldung der Erweiterung, auch auf Deutsch, und
verlinkt eine Anleitung für ein Board-Display im Kiosk-Modus, das mit dem Computer
startet.

Nicht mit Autodarts verbunden.

## Permission justifications

• storage — um deine gespeicherten Konten, ihre Sitzungen und die Einstellungen auf
  dem Computer zu halten, im Modus für Verein und Kneipe auch die gesalzenen Hashes
  der PINs.
• alarms — um geparkte Sitzungen im Hintergrund zu erneuern, damit sie bereit
  bleiben, und im Modus für Verein und Kneipe einmal pro Minute zu prüfen, ob das
  Display nach einer Pause zurückkehren soll.
• scripting — um den Knopf einer neuen Version in die Autodarts-Tabs zu bringen,
  die beim Update schon offen sind, oder in einen, der nicht mehr antwortet, damit
  ein Display im Kiosk-Modus ohne Neuladen weiter funktioniert. Es führt nur das eigene Skript der Erweiterung aus, nur auf
  play.autodarts.com.
• unlimitedStorage — damit Chrome den Schlüssel, der deine gespeicherten Sitzungen
  und Passwörter versiegelt, nie löscht, wenn der Speicherplatz knapp wird. Ohne ihn
  müsste sich jedes geparkte Konto neu anmelden.
• Web-zugängliche Ressource switcher.html, nur für play.autodarts.com — die
  Spieler, die der Knopf auf der Autodarts-Seite über der Seite zeigt. Sie ist eine
  Seite der Erweiterung in einem Rahmen, darum können die Skripte der
  Autodarts-Seite die gespeicherten Konten nicht daraus lesen.
• Host-Zugriff auf `https://play.autodarts.com/*` — um eine Sitzung in die Autodarts-Seite und
  aus ihr heraus zu bringen, dort den Knopf zu zeigen und die offenen Autodarts-Tabs
  zu finden, damit der Wechsel im vorderen wirkt und die anderen neu laden. Adresse
  und Titel anderer Tabs kann die Erweiterung nicht lesen.
• Host-Zugriff auf `https://api.autodarts.com/*` — um anzumelden, eine Sitzung zu erneuern und
  zu beenden, dieselben Anfragen wie die Autodarts-Website. Mit keinem anderen
  Server verbindet sich die Erweiterung, und ihre Content Security Policy setzt das
  durch.

## Startseite und Support

Der Store nimmt die Adressen der Startseite und des Supports einmal für alle
Sprachen, aus [`listing.en.md`](listing.en.md#homepage-and-support-urls). Die
englischen Seiten verlinken die deutschen im Sprachumschalter ihres Kopfs: die
[Startseite](https://dennis-otto.github.io/player-switch-for-autodarts/de/), die
[Hilfe](https://dennis-otto.github.io/player-switch-for-autodarts/de/help.html) und
die [Datenschutzerklärung](https://dennis-otto.github.io/player-switch-for-autodarts/de/privacy.html).

## Kategorie

Produktivität

## Einziger Zweck

Das angemeldete Autodarts-Konto an einem gemeinsamen Display wechseln, ohne sich
neu anzumelden.

## Bilder

Die Screenshots (1280×800) und die Werbekacheln (440×280 und 1400×560) dieses Eintrags sind die `.de`-Dateien in [`images/`](images/), gerendert von `bash scripts/screenshots.sh`; [die Release-Anleitung](../docs/releases.md#the-images-of-the-store) sagt, welcher Platz im Dashboard welche Datei nimmt.
