# Ein gemeinsames Display

Ein Board-Display im Flur, im Verein oder in der Kneipe: ein Computer am Board, ein Bildschirm, an den alle herankommen, und Chrome mit Autodarts. Diese Anleitung richtet es so ein, dass jeder Spieler unter seinem eigenen Konto spielt und ein Tipp die Spieler wechselt, auch im Vollbild und im Kiosk-Modus, und dass das Display von selbst startet und tagelang bereit bleibt.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/display-setup.de.dark.svg">
  <img src="images/diagrams/display-setup.de.svg" alt="Ein gemeinsames Display einrichten: Installiere Player Switch und speichere dann jeden Spieler einmal: Jeder meldet sich nach Konto hinzufügen auf Autodarts an. Der Besitzer des Boards teilt es in Autodarts mit jedem gespeicherten Konto, damit jeder Spieler es nach einem Wechsel sieht. An einem Display, das die Symbolleiste zeigt, hefte das Symbol an; im Vollbild oder Kiosk-Modus wechseln die Spieler mit dem Knopf auf der Autodarts-Seite oder dem Tastenkürzel. Lass den Computer Chrome von selbst im Kiosk-Modus starten, gib ihm eine Bildschirmtastatur für die Anmeldungen und lass den Browser laufen, damit die Erneuerung alle 12 Stunden jedes geparkte Konto bereit hält.">
</picture>

## Was du brauchst

- **Einen Computer am Board** mit Google Chrome unter Windows, macOS oder Linux, oder einen Raspberry Pi mit Raspberry Pi OS und seinem Chromium.
- **Einen Bildschirm, an den die Spieler herankommen**, am besten einen Touchscreen; eine Maus oder eine kleine Funktastatur geht auch.
- **Ein Autodarts-Konto für jeden Spieler**, mit dem das Board geteilt ist, und ein Browserprofil für das Display: ein eigenes, nicht das persönliche Profil von jemandem. Die Erweiterung behält die Konten in diesem Profil.

## 1. Die Spieler speichern {#save-the-players}

Installiere die Erweiterung aus [dem Chrome Web Store](https://chromewebstore.google.com/detail/player-switch-for-autodar/gbijblgchbbbkjeibpjaodflfgbgefam?hl=de), der sie von selbst aktuell hält, oder entpackt, wie es der [Schnellstart](https://github.com/Dennis-Otto/player-switch-for-autodarts#quick-start) zeigt. Eine Willkommensseite öffnet sich mit vier Schritten: das Symbol anheften, den ersten Spieler anmelden, die nächsten hinzufügen und das Board teilen. [Einrichten](index.md#einrichten) auf der Startseite zeigt sie.

Jeder Spieler meldet sich einmal an: Wähle **Konto hinzufügen**, und die nächste Anmeldung auf Autodarts wird von selbst gespeichert. Speichere alle Spieler, bevor du den Kiosk-Modus einschaltest, solange Tastatur und Symbolleiste zur Hand sind; **Konto hinzufügen** bei den Spielern auf der Autodarts-Seite geht auch im Kiosk-Modus.

Teile dann das Board mit jedem gespeicherten Konto. Autodarts zeigt ein Board nur dem Konto, dem es gehört, und den Konten, mit denen sein Besitzer es teilt; ein Spieler, mit dem es nicht geteilt ist, sieht nach einem Wechsel kein Board. Der Besitzer meldet sich bei Autodarts an und fügt jeden Spieler über seinen genauen Benutzernamen hinzu, bis zu 10 Konten neben dem eigenen; in der englischen Ansicht von Autodarts heißt die Seite dafür **My Boards**. Im Verein oder in der Kneipe gehört das Board am besten einem Autodarts-Konto des Lokals, damit es bleibt, wenn ein Mitglied geht: [Nach einem Wechsel fehlt das Board](help.md#board-not-shared) sagt mehr.

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
- **Kein Inkognito, kein Gast:** Ergänze nie `--incognito` oder `--guest`. Chrome führt in einem Gastfenster keine Erweiterung aus, Player Switch läuft in keinem Inkognitofenster, und die gespeicherten Konten gehören zum normalen Profil.

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

## 7. Im Verein oder in der Kneipe: der Modus für Verein und Kneipe {#venue-mode}

Zu Hause darf jeder am Display unter jedem gespeicherten Konto spielen, genau dafür ist es da. In einem Verein oder einer Kneipe kennt nicht jeder am Board jeden. Der Modus für Verein und Kneipe, unter **Einstellungen** → **Für Verein und Kneipe**, bringt drei Sperren für die Leute am Display. Jede ist aus, bis du sie einschaltest.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/venue-mode.de.dark.svg">
  <img src="images/diagrams/venue-mode.de.svg" alt="Der Modus für Verein und Kneipe an einem Display: Ein Tipp auf die Kachel eines Kontos mit PIN fragt nach dieser PIN, bevor sich etwas ändert; eine falsche ändert nichts, und fünf in Folge sperren jede PIN für eine Minute. Einmal pro Minute schaut der Service Worker, ob die Pause vorbei ist. Ein laufendes Match zählt als Eingabe, so wird ein Match nie unterbrochen, und eine Lobby, die auf Spieler wartet, macht die Pause dreimal so lang. Nach der Pause wechselt das Display zum Hauskonto, oder es meldet sich ab, wenn keins festgelegt ist oder es sich neu anmelden muss; so oder so behält der Spieler davor seine Sitzung geparkt.">
</picture>

- **Eine Manager-PIN** schützt **Konten verwalten**, wo Konten entfernt und Passwörter gemerkt oder vergessen werden, und die Einstellungen selbst. Das Popup und die Spieler auf der Autodarts-Seite fragen einmal nach ihr, wenn **Konten verwalten** aufgeht, und vergessen sie, wenn es wieder zugeht. Sein eigenes Konto schützt oder entfernt ein Spieler trotzdem ohne sie, wie [unten](#own-account) beschrieben.
- **Eine PIN für jeden Spieler, der eine möchte,** 4 bis 8 Ziffern, unter **PINs der Spieler**, oder vom Spieler selbst festgelegt mit **Mit einer PIN schützen**, während sein Konto spielt. Ein Tipp auf die Kachel dieses Spielers fragt nach ihr, auf einem Ziffernblock, der auf einem Touchscreen geht, bevor sich etwas ändert; seine Kachel zeigt ein Schloss. Niemand sonst spielt unter seinem Konto und verdirbt ihm die Statistik.
- **Zurück nach einer Pause:** Nach 5 bis 60 Minuten ohne Tippen, Klicken oder Taste auf der Autodarts-Seite wechselt das Display zu einem Hauskonto deiner Wahl oder meldet sich ab, damit die nächsten Spiele nicht für den Spieler zählen, der gegangen ist. Ein Match wird nie unterbrochen: Die Pause beginnt erst, wenn es zu Ende ist. Eine Lobby, die auf einen Gegner oder den Rest einer Gruppe wartet, hält das Display dreimal so lang wie die Pause, damit niemand aufs Display tippen muss, während die Spieler beitreten; eine Lobby, die alle verlassen haben, bringt das Display am Ende trotzdem zurück. Der Spieler davor behält seine Sitzung geparkt, ein Tipp holt ihn zurück. Solange Autodarts nicht erreichbar ist, bleibt das Display, wie es ist, und versucht es eine Minute später wieder.

Fünf falsche PINs in Folge sperren jede PIN des Displays für eine Minute, damit niemand sie alle von Hand durchprobiert. Die Erweiterung speichert keine PIN, nur einen gesalzenen Hash davon.

### Das eigene Konto eines Spielers, ohne den Manager {#own-account}

**Konto hinzufügen** steht an einem Display mit Manager-PIN allen offen, so kann ein Mitglied oder ein Gast sein Konto hinzufügen, während der Manager nicht da ist. Was dieses Konto schützt oder entfernt, braucht den Manager auch nicht, damit niemand eine Sitzung auf dem Display zurücklässt, unter der jeder spielen kann:

1. **Mit einer PIN schützen,** unter der Kachel des Spielers, der gerade spielt, solange sein Konto keine PIN hat: Es fragt zweimal nach einer PIN mit 4 bis 8 Ziffern. Von da an zeigt die Kachel ein Schloss und fragt nach der PIN, bevor jemand unter dem Konto spielt.
2. **Mein Konto entfernen,** unter derselben Kachel, sobald das Konto eine PIN hat: Es fragt nach einem Ja und dieser PIN, meldet das Konto dann bei Autodarts ab und entfernt es vom Display, wie **Konto entfernen** es tut. Ein Spieler, dessen Konto geparkt ist, wechselt zuerst mit seiner PIN zu ihm.

Nur ein Konto, das hinzugefügt wurde, während die Manager-PIN gesetzt war, bekommt so eine erste PIN, während es spielt, und nie eine zweite: Eine PIN, die ein Konto hat, ändert nur der Manager, unter **PINs der Spieler**. Die Konten der Stammspieler, gespeichert vor der Manager-PIN, bekommen nie eine von dem, der gerade unter ihnen spielt und sie dann entfernen könnte; ein später hinzugefügtes Konto übernimmt der Manager, indem er unter **PINs der Spieler** seine PIN setzt oder löscht. Das Hauskonto gehört dem Manager: Es bekommt so keine PIN und wird so nicht entfernt. Eine falsche PIN zählt zu den fünf, die jede PIN für eine Minute sperren.

Eine PIN ist eine Sperre für die Leute am Display, kein Schutz vor jemandem, der den Computer benutzen kann: Wer `chrome://extensions` öffnen kann, kann die Erweiterung entfernen, und ein Programm, das das Profil des Browsers liest, kann jede 4-stellige PIN gegen ihren Hash probieren. Das [Sicherheitsdesign](security.md#venue-mode) sagt mehr dazu.

### Eine vergessene Manager-PIN {#forgotten-manager-pin}

Die Manager-PIN steht nirgends. Wer den Computer benutzen kann, schaltet den Modus für Verein und Kneipe aus, und die Konten bleiben:

1. Öffne `chrome://extensions` und schalte oben rechts den **Entwicklermodus** ein.
2. Wähle unter **Player Switch for Autodarts** neben *Ansichten prüfen* den **Service Worker**.
3. Tippe in der **Konsole** des Fensters, das aufgeht, `chrome.storage.local.remove("venue")` ein und drücke <kbd>Enter</kbd>.

Dann ist jede PIN weg, und das Display kehrt nach einer Pause nicht mehr zurück: Lege sie unter **Einstellungen** neu fest.

## 8. Vor dem ersten Abend {#checklist}

- [ ] Ein Tipp auf jede Kachel wechselt zu diesem Spieler, und **Konten verwalten** zeigt kein **Neu anmelden**.
- [ ] Nach einem Tipp auf jede Kachel zeigt Autodarts das Board: Es ist mit jedem gespeicherten Konto geteilt.
- [ ] Der Knopf auf der Autodarts-Seite sitzt in einer Ecke, in der er nichts verdeckt, was du brauchst.
- [ ] Chrome speichert an diesem Display kein Passwort, und niemand ist darin noch bei Google oder Apple angemeldet.
- [ ] Nach einem Neustart des Computers kommt Chrome von selbst wieder, im Kiosk-Modus auf Autodarts.
- [ ] Der Computer geht nicht in den Ruhezustand, oder er wacht oft genug für die Erneuerung auf.
- [ ] Alle kennen die Regel: Spieler wechseln mit einer Kachel, nie mit einer Abmeldung auf Autodarts, die eine Sitzung für immer beendet.
- [ ] Im Verein oder in der Kneipe: Die Manager-PIN ist gesetzt und den Leuten bekannt, die das Display betreuen, und jeder Spieler, der eine PIN möchte, hat eine.

## 9. Wenn das Display den Besitzer wechselt {#changes-hands}

Bevor der Computer verkauft, verschenkt oder aus dem Verein abgegeben wird, öffne **Konten verwalten** und wähle [**Alle Konten vergessen**](help.md#forget-all), solange Autodarts erreichbar ist. Das meldet jedes gespeicherte Konto bei Autodarts ab, auch den Spieler auf der Seite, und löscht alles, was die Erweiterung speichert, mit dem Schlüssel, der die Sitzungen versiegelt, den PINs und den Einstellungen. Die Erweiterung nur zu entfernen meldet niemanden bei Autodarts ab. Ein Spieler, der den Verein für immer verlässt, wird genauso entfernt, ein Konto nach dem anderen, mit **Konto entfernen**, oder entfernt sein eigenes Konto mit [**Mein Konto entfernen**](#own-account) und seiner PIN.

Läuft etwas nicht wie gedacht? Die [Hilfe](help.md) erklärt jede Meldung der Erweiterung.
