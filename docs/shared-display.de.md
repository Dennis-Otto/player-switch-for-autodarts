# Ein gemeinsames Display

Ein Board-Display im Flur, im Verein oder in der Kneipe: ein Computer am Board, ein Bildschirm, an den alle herankommen, und Chrome mit Autodarts. Diese Anleitung richtet es so ein, dass jeder Spieler unter seinem eigenen Konto spielt und ein Tipp die Spieler wechselt, auch im Vollbild und im Kiosk-Modus, und dass das Display von selbst startet und tagelang bereit bleibt.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/display-setup.de.dark.svg">
  <img src="images/diagrams/display-setup.de.svg" alt="Ein gemeinsames Display einrichten: Installiere Player Switch und speichere dann jeden Spieler einmal: Jeder meldet sich nach Konto hinzufügen auf Autodarts an. An einem Display, das die Symbolleiste zeigt, hefte das Symbol an; im Vollbild oder Kiosk-Modus wechseln die Spieler mit dem Knopf auf der Autodarts-Seite oder dem Tastenkürzel. Lass den Computer Chrome von selbst im Kiosk-Modus starten, gib ihm eine Bildschirmtastatur für die Anmeldungen und lass den Browser laufen, damit die Erneuerung alle 12 Stunden jedes geparkte Konto bereit hält.">
</picture>

## Was du brauchst

- **Einen Computer am Board** mit Google Chrome unter Windows, macOS oder Linux, oder einen Raspberry Pi mit Raspberry Pi OS und seinem Chromium.
- **Einen Bildschirm, an den die Spieler herankommen**, am besten einen Touchscreen; eine Maus oder eine kleine Funktastatur geht auch.
- **Ein Autodarts-Konto für jeden Spieler** und ein Browserprofil für das Display: ein eigenes, nicht das persönliche Profil von jemandem. Die Erweiterung behält die Konten in diesem Profil.

## 1. Die Spieler speichern {#save-the-players}

Installiere die Erweiterung aus dem Chrome Web Store, oder entpackt, wie es der [Schnellstart](https://github.com/Dennis-Otto/player-switch-for-autodarts#quick-start) zeigt. Eine Willkommensseite öffnet sich mit drei Schritten: das Symbol anheften, den ersten Spieler anmelden und die nächsten hinzufügen. [Einrichten](index.md#einrichten) auf der Startseite zeigt sie.

Jeder Spieler meldet sich einmal an: Wähle **Konto hinzufügen**, und die nächste Anmeldung auf Autodarts wird von selbst gespeichert. Speichere alle Spieler, bevor du den Kiosk-Modus einschaltest, solange Tastatur und Symbolleiste zur Hand sind; **Konto hinzufügen** bei den Spielern auf der Autodarts-Seite geht auch im Kiosk-Modus.

## 2. Wählen, wie die Spieler wechseln {#how-players-switch}

- **Das Symbol in der Symbolleiste**, angeheftet, für ein Display, das den Browser wie gewohnt zeigt. Ein Tipp darauf öffnet die Spieler.
- **Der Knopf auf der Autodarts-Seite**, ein runder Knopf in einer Ecke mit dem Bild des Spielers. Ein Tipp darauf zeigt die Spieler über der Seite, in großen Kacheln für einen Touchscreen. Im Vollbild und im Kiosk-Modus ist er der Weg zum Wechseln. **Einstellungen** im Popup setzt ihn in die Ecke, in der er nichts verdeckt, was du auf Autodarts brauchst, oder blendet ihn aus.
- **Die Tastatur:** <kbd>Alt</kbd>+<kbd>Umschalt</kbd>+<kbd>O</kbd> öffnet und schließt die Spieler auf der Seite, die Tasten <kbd>1</kbd> bis <kbd>9</kbd> wählen einen Spieler, und <kbd>Esc</kbd> schließt sie. Das Tastenkürzel änderst du unter `chrome://extensions/shortcuts`.

## 3. Vollbild oder Kiosk-Modus {#fullscreen-or-kiosk}

**Das Vollbild** blendet Symbolleiste und Tabs aus: <kbd>F11</kbd> unter Windows und Linux, <kbd>Control</kbd>+<kbd>Befehl</kbd>+<kbd>F</kbd> auf einem Mac, und dieselben Tasten beenden es wieder.

**Der Kiosk-Modus** startet Chrome auf einer einzigen Seite, ohne Adressleiste, Tabs oder Menüs, und niemand am Display verlässt ihn aus Versehen. Starte ihn mit diesem Befehl, unter Windows mit dem vollen Pfad von Chrome:

```text
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk https://play.autodarts.com
```

Auf einem Raspberry Pi heißt der Befehl `chromium --kiosk https://play.autodarts.com`; unter Raspberry Pi OS Bookworm und älter heißt Chromium `chromium-browser`. <kbd>Alt</kbd>+<kbd>F4</kbd> beendet den Kiosk-Modus.

- **Schließe vorher jedes Chrome-Fenster.** Ein Chrome, das schon läuft, öffnet ein normales Fenster und übergeht `--kiosk`.
- **Das Profil des Displays:** Gibt es auf dem Computer mehr als ein Chrome-Profil, ergänze `--profile-directory="Profile 1"` mit dem Namen seines Ordners, den `chrome://version` als letzten Teil des *Profilpfads* zeigt.
- **Kein Inkognito, kein Gast:** Ergänze nie `--incognito` oder `--guest`. Chrome führt in einem Gastfenster keine Erweiterung aus, und die gespeicherten Konten gehören zum normalen Profil.

## 4. Mit dem Computer starten {#autostart}

### Windows

1. Drücke <kbd>Win</kbd>+<kbd>R</kbd>, tippe `shell:startup` und drücke <kbd>Enter</kbd>: Der Ordner der Programme, die starten, wenn sich dieser Windows-Benutzer anmeldet, öffnet sich.
2. Klicke mit der rechten Maustaste hinein, wähle **Neu → Verknüpfung** und gib als Speicherort den Befehl für den Kiosk-Modus von oben ein.
3. Gib ihr einen Namen, etwa *Autodarts*, und wähle **Fertig stellen**.

Chrome startet dann jedes Mal im Kiosk-Modus, wenn sich dieser Benutzer anmeldet. Ein Display, das nach einem Stromausfall von selbst wiederkommen soll, braucht außerdem einen Windows-Benutzer, der sich ohne Frage nach dem Passwort anmeldet.

### Raspberry Pi OS

Lege die Datei `~/.config/autostart/autodarts.desktop` mit diesen Zeilen an; der Desktop startet sie bei jedem Start, unter Raspberry Pi OS mit Wayland wie mit X11:

```ini
[Desktop Entry]
Type=Application
Name=Autodarts
Exec=chromium --kiosk https://play.autodarts.com
```

Unter Raspberry Pi OS Bookworm und älter schreibst du `chromium-browser` statt `chromium`. **Auto Login** unter **Raspberry Pi Configuration → System**, die automatische Anmeldung, meldet den Desktop von selbst an, damit das Display nach einem Stromausfall wiederkommt.

## 5. Auf einem Touchscreen tippen {#on-screen-keyboard}

Nur die Anmeldungen brauchen eine Tastatur: einmal pro Spieler, und wieder nur, wenn eine Kachel **Neu anmelden** zeigt.

- **Windows 11:** Unter **Einstellungen → Zeit und Sprache → Eingabe → Bildschirmtastatur** lässt du Windows die Bildschirmtastatur zeigen, wenn keine Tastatur angeschlossen ist; sie öffnet sich dann, sobald du in ein Feld tippst.
- **Raspberry Pi OS** bringt eine Bildschirmtastatur für einen Touchscreen mit, die **Raspberry Pi Configuration** ein- und ausschaltet.
- **Oder eine kleine Funktastatur**, die nach den Anmeldungen wieder weggelegt wird.

Bietet Chrome am Display an, ein Passwort zu speichern, wähle **Nie**: Die Erweiterung braucht kein Passwort, und jede Person am Display könnte ein gespeichertes nutzen. Nach einer Anmeldung mit Google oder Apple meldest du dich in diesem Browser wieder bei Google oder Apple ab; die [Hilfe](help.md#google-or-apple) sagt, warum.

## 6. Bereit halten {#keep-it-ready}

Die Erweiterung erneuert jede geparkte Sitzung alle 12 Stunden, solange der Browser läuft. Während der Computer im Ruhezustand ist, läuft keine Erneuerung, und Chrome holt die fällige nach, sobald der Computer aufwacht; war der Computer aus, erneuert die Erweiterung gleich beim Start des Browsers. Wie lange eine Sitzung ohne Erneuerung hält, bestimmt Autodarts.

- **Ein Display, das jeden Tag läuft,** braucht nichts weiter.
- **Ein Display, das tagelang aus ist,** etwa in einem Verein, der einmal pro Woche spielt: Schalte es zwischendurch ab und zu ein, oder lass die Konten mit Autodarts-Passwort es sich merken, damit sie sich von selbst wieder anmelden. Jedes andere Konto, das sich neu anmelden muss, zeigt **Neu anmelden**, und die [Hilfe](help.md#sign-in-again) sagt, was dann zu tun ist.
- **Der Bildschirm darf ausgehen**, wann er will: Die Erneuerung braucht nur den Computer und den Browser. Stelle die Energieoptionen von Windows so ein, dass der Computer am Netz nicht in den Ruhezustand geht, und lass nur den Bildschirm ausgehen. Ein Raspberry Pi geht nicht in den Ruhezustand; **Screen Blanking** unter **Raspberry Pi Configuration → Display** schaltet nur den Bildschirm aus.

## 7. Vor dem ersten Abend {#checklist}

- [ ] Ein Tipp auf jede Kachel wechselt zu diesem Spieler, und **Konten verwalten** zeigt kein **Neu anmelden**.
- [ ] Der Knopf auf der Autodarts-Seite sitzt in einer Ecke, in der er nichts verdeckt, was du brauchst.
- [ ] Chrome speichert an diesem Display kein Passwort, und niemand ist darin noch bei Google oder Apple angemeldet.
- [ ] Nach einem Neustart des Computers kommt Chrome von selbst wieder, im Kiosk-Modus auf Autodarts.
- [ ] Der Computer geht nicht in den Ruhezustand, oder er wacht oft genug für die Erneuerung auf.
- [ ] Alle kennen die Regel: Spieler wechseln mit einer Kachel, nie mit einer Abmeldung auf Autodarts, die eine Sitzung für immer beendet.

Läuft etwas nicht wie gedacht? Die [Hilfe](help.md) erklärt jede Meldung der Erweiterung.
