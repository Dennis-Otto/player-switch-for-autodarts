# Hilfe

Was jede Meldung von Player Switch bedeutet und was du dann tust, und die Antworten auf die Fragen, die an einem gemeinsamen Display aufkommen. Such auf dieser Seite nach den Worten auf deinem Bildschirm: Jede Meldung steht hier Wort für Wort. Du richtest ein neues Display ein? Die [Anleitung für ein gemeinsames Display](shared-display.md) führt hindurch, von der Installation bis zum Kiosk-Modus und zum Start mit dem Computer.

## Meldungen

### Neu anmelden {#sign-in-again}

> Neu anmelden

Das steht auf einer Kachel, und das Symbol in der Symbolleiste zeigt, wie viele Konten sich neu anmelden müssen; sein Tooltip nennt sie, etwa:

> Player Switch for Autodarts – neu anmelden: Ada und Bob

**Was es bedeutet:** Autodarts nimmt die gespeicherte Sitzung dieses Kontos nicht mehr an, bei einer Erneuerung oder bei einem Tipp, und kein gemerktes Passwort konnte es anmelden. Eine gemerkte Anmeldung, die zu einem anderen Konto als dem der Kachel gehört, gilt ebenfalls als abgelehnt: Die Erweiterung beendet diese Sitzung sofort, damit nie der falsche Spieler unter dieser Kachel spielt. Eine Sitzung endet auch für immer, wenn sich der Spieler auf der Autodarts-Seite abmeldet: Zum Wechseln der Spieler tippst du stattdessen auf eine Kachel. Hat sich danach jemand direkt auf der Seite als anderer Spieler angemeldet, gibt der nächste Tipp oder **Konto hinzufügen** diese Sitzung an die Kachel dieses Spielers, und der abgemeldete Spieler zeigt diese Meldung. Ein Spieler mit gemerktem Passwort zeigt sie nicht: Noch hat nichts dieses Passwort versucht, darum meldet die nächste Erneuerung oder ein Tipp das Konto damit an, und **Zurück nach einer Pause** bringt das Display weiter zu ihm als Hauskonto zurück. Und wurden die Daten der Erweiterung gelöscht, muss sich jedes geparkte Konto auf einmal neu anmelden: Der Schlüssel, der die gespeicherten Sitzungen versiegelt, ging mit, darum lassen sie sich nicht mehr öffnen, und die gemerkten Passwörter sind ebenfalls vergessen.

**Was du tust**, auf einem von zwei Wegen:

1. Wähle **Konto hinzufügen**, im Popup oder bei den Spielern auf der Autodarts-Seite, und melde dich auf Autodarts als dieser Spieler an, mit Passwort, Google oder Apple. Die Erweiterung erkennt das Konto wieder: Dieselbe Kachel ist bereit, und ein gemerktes Passwort bleibt.
2. Für ein Konto mit Autodarts-Passwort: Wähle unter **Konten verwalten** für das Konto **Passwort merken** und tippe dann auf seine Kachel. Die Erweiterung [prüft das Passwort bei Autodarts](#remember-password), während sie es speichert, und meldet das Konto von selbst an, jetzt und jedes Mal, wenn seine Sitzung wieder endet.

Ein Tipp auf so eine Kachel sagt dasselbe:

> Bob muss sich neu anmelden: über „Konto hinzufügen“ einmal auf Autodarts anmelden, oder das Passwort merken.

Ein Konto, das sich sein Passwort merkt und sich trotzdem neu anmelden muss, hat ein Passwort, das Autodarts nicht mehr annimmt, etwa nach einer Änderung des Passworts, oder die Anmeldung eines anderen Kontos, gemerkt, bevor die Erweiterung sie geprüft hat: Wähle **Passwort nicht mehr merken** und dann **Passwort merken** mit dem richtigen. Müssen sich alle gespeicherten Konten auf einmal neu anmelden? Dann lies zuerst [Autodarts hat vielleicht geändert, wie die Anmeldung funktioniert](#sign-in-changed).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/sign-in-again.de.dark.svg">
  <img src="images/diagrams/sign-in-again.de.svg" alt="Was tun, wenn eine Kachel Neu anmelden zeigt: Zeigen es alle gespeicherten Konten auf einmal, schau zuerst nach einem Update der Erweiterung. Sonst wählt ein Konto, das sich mit Google oder Apple anmeldet, oder eines ohne gemerktes Passwort, Konto hinzufügen und meldet sich einmal auf Autodarts als dieser Spieler an; dieselbe Kachel ist wieder bereit. Ein Konto mit Autodarts-Passwort kann sich stattdessen das Passwort merken lassen und auf die Kachel tippen, und die Erweiterung meldet es von selbst an. Merkt es sich schon ein Passwort, geht dieses nicht mehr: nicht mehr merken und das neue merken.">
</picture>

### Passwort merken {#remember-password}

**Passwort merken** unter **Konten verwalten** meldet das Konto einmal mit dem Benutzernamen oder der E-Mail und dem Passwort bei Autodarts an, bevor es sie sich merkt. So zeigt sich ein Tippfehler sofort und nicht erst Wochen später, wenn die gespeicherte Sitzung abgelaufen ist und das Passwort gebraucht wird. Nimmt Autodarts sie an, bekommt das Konto die Sitzung dieser Anmeldung, bereit zum Spielen, und **Neu anmelden** verschwindet. Sonst wird nichts gemerkt, und das Formular öffnet sich wieder mit dem Benutzernamen, sodass nur das Passwort neu getippt wird. Es sagt:

> Autodarts hat diesen Benutzernamen und dieses Passwort nicht angenommen, deshalb sind sie nicht gemerkt. Prüfe beides und versuche es nochmal.

**Was es bedeutet:** Autodarts hat den Benutzernamen oder die E-Mail oder das Passwort abgelehnt.

**Was du tust:** Prüfe beides, so wie es auf [play.autodarts.com](https://play.autodarts.com) funktioniert, und speichere noch einmal. Ein Konto, das sich mit Google oder Apple anmeldet, hat kein Autodarts-Passwort: Es nutzt stattdessen **Konto hinzufügen**, wie [Konten, die sich mit Google oder Apple anmelden](#google-or-apple) sagt.

Oder:

> Dieser Benutzername und dieses Passwort melden ein anderes Konto als Bob an, deshalb sind sie nicht gemerkt. Gib die von Bob ein.

**Was es bedeutet:** Autodarts hat die Anmeldung angenommen, aber sie gehört zu einem anderen Konto als die Kachel, etwa zum Konto eines anderen Spielers. Unter dieser Kachel gemerkt, brächte sie den falschen Spieler auf die Seite, darum beendet die Erweiterung diese Sitzung sofort wieder.

**Was du tust:** Gib den Benutzernamen oder die E-Mail und das Passwort des Spielers dieser Kachel ein.

Ist Autodarts nicht erreichbar, sagt das Formular das [wie überall](#unreachable), und nichts wird gemerkt: Versuche es gleich noch einmal.

### Ein + am Symbol {#not-saved-yet}

Der Tooltip des Symbols sagt:

> Player Switch for Autodarts – ein Konto auf Autodarts ist noch nicht gespeichert

und das Popup und die Spieler auf der Autodarts-Seite sagen:

> Auf Autodarts ist jemand angemeldet, der hier noch nicht gespeichert ist.

**Was es bedeutet:** Jemand hat sich auf Autodarts angemeldet, und die Erweiterung behält dieses Konto nicht. Sie speichert eine neue Anmeldung nur in den zehn Minuten nach **Konto hinzufügen** oder der Installation von selbst, nur einmal und nur, solange kein gespeichertes Konto spielt; jede andere Anmeldung wartet auf einen Tipp, damit niemand aus Versehen gespeichert wird.

**Was du tust:** **Konto speichern** speichert es, und eine Kachel für diesen Spieler erscheint. Jemand, der nicht gespeichert werden soll: Lass es so, dann wird nichts gespeichert. Das `+` verschwindet, sobald der Autodarts-Tab geschlossen wird oder sich diese Person auf der Seite abmeldet.

### Autodarts ist gerade nicht erreichbar {#unreachable}

> Autodarts ist gerade nicht erreichbar. Bitte gleich nochmal versuchen.

**Was es bedeutet:** Die Erweiterung konnte Autodarts nicht nach der Sitzung dieses Kontos fragen oder, bei einem Tipp oder **Konto hinzufügen**, wem die Sitzung in der Seite gehört, oder, bei **Passwort merken**, ob das Passwort stimmt: Der Computer hat keine Verbindung zum Internet, oder Autodarts hat ein Problem. Nichts hat sich geändert: Die Seite bleibt, wie sie war, und keine Sitzung geht verloren.

**Was du tust:** Prüfe, ob [play.autodarts.com](https://play.autodarts.com) lädt, und tippe dann noch einmal. In Firefox prüfe auch [den Zugriff auf die Autodarts-Seiten](#firefox-site-access). Die Erneuerung im Hintergrund versucht es nach 15 Minuten von selbst wieder.

### Autodarts hat in keinem Tab geantwortet {#no-page}

> Autodarts hat in keinem Tab geantwortet. Öffne Autodarts und versuche es dann nochmal.

**Was es bedeutet:** Die Erweiterung schiebt eine Sitzung in die Autodarts-Seite und wieder heraus, darum braucht ein Wechsel einen Autodarts-Tab, und keiner hat rechtzeitig geantwortet: Keiner ist offen, oder der offene war noch nicht fertig geladen.

**Was du tust:** Wähle **Autodarts öffnen** im Popup, warte, bis die Seite geladen ist, und tippe noch einmal auf die Kachel. Ist schon ein Autodarts-Tab offen, lade ihn zuerst neu.

### Etwas ist schiefgelaufen {#error}

> Etwas ist schiefgelaufen. Bitte nochmal versuchen.

**Was es bedeutet:** Etwas ist fehlgeschlagen, womit die Erweiterung nicht gerechnet hat. Unter **Einstellungen** sagt dieselbe Meldung, dass eine Einstellung nicht gespeichert wurde.

**Was du tust:** Versuch es noch einmal, und lade die Autodarts-Seite neu, wenn die Meldung wiederkommt. Bleibt sie, wähle **Problem melden** unten im Popup: Es öffnet das Fehlerformular mit den Versionen der Erweiterung und des Browsers, und mit nichts sonst.

### Ein Match läuft {#match-running}

> Ein Match läuft
>
> Ein Wechsel beendet es auf diesem Display.

**Was es bedeutet:** Die Autodarts-Seite zeigt ein laufendes Match, und ein Wechsel lädt die Seite neu. Die Erweiterung fragt, bevor sie etwas ändert.

**Was du tust:** **Weiterspielen** ändert nichts. **Trotzdem wechseln** wechselt, und das Match endet auf diesem Display.

Wer den Spieler entfernt, der gerade spielt, oder **Alle Konten vergessen** wählt, meldet die Seite ab, und die Erweiterung fragt vorher genauso:

> Ein Match läuft
>
> Das Abmelden beendet es auf diesem Display.

**Weiterspielen** ändert auch hier nichts; **Trotzdem abmelden** macht weiter, und das Match endet auf diesem Display.

**Konto speichern** schreibt die Sitzung zurück in die Seite, die dadurch neu lädt, und fragt vorher genauso:

> Ein Match läuft
>
> Das Speichern lädt die Seite neu und beendet es auf diesem Display.

**Weiterspielen** speichert nichts; **Trotzdem speichern** speichert das Konto, und das Match endet auf diesem Display.

### Der Lobby beitreten {#join-lobby}

Solange der Autodarts-Tab eine Lobby zeigt, die Seite unter `play.autodarts.com/lobby/` mit der ID der Lobby, bietet die Kachel jedes geparkten Spielers **Der Lobby beitreten** an, im Popup und in den Spielern auf der Seite. Ein Tipp setzt diesen Spieler in die Lobby, und die Kachel zeigt danach:

> In der Lobby

Unter dieser Kachel setzt das leisere **Erneut beitreten** den Spieler noch einmal in die Lobby. Tippe darauf, wenn die Lobby bei Autodarts ihn nicht mehr aufführt, etwa nachdem ihr Gastgeber ihn herausgenommen hat: Die Erweiterung merkt sich die Plätze, die sie einnimmt, und beobachtet die Lobby nicht, darum zeigt die Kachel weiter **In der Lobby**. Sitzt der Spieler noch dort, ändert sich nichts, und das Popup sagt:

> Bob ist noch in der Lobby: Autodarts hat den Platz behalten, also hat sich nichts geändert.

**Was es bedeutet:** Autodarts führt Bob schon in der Lobby, darum hat die Erweiterung keinen zweiten Platz verlangt. Sie hat nur seine geparkte Sitzung erneuert, um die Lobby zu lesen.

**Was du tust:** nichts, Bob spielt mit. Zeigt die Lobby auf der Seite ihn nicht, lade die Seite neu, dann zeigt sie die Lobby so, wie Autodarts sie hat.

[Zwei Spieler, jeder mit eigener Statistik](#two-players) erklärt, wie es funktioniert. Kann die Erweiterung den Spieler nicht in die Lobby setzen, sagt das Popup stattdessen eines davon:

> Autodarts zeigt keine Lobby mehr. Die Lobby auf Autodarts öffnen, dann nochmal versuchen.

**Was es bedeutet:** Der Autodarts-Tab hat die Lobby vor dem Tipp verlassen, etwa für das Match, das inzwischen begonnen hat, oder für eine andere Seite. Die Erweiterung setzt einen Spieler nur in die Lobby, die der Tab in diesem Moment zeigt.

**Was du tust:** Öffne die Lobby auf Autodarts wieder und tippe auf **Der Lobby beitreten**. Ein Match, das schon begonnen hat, nimmt keinen neuen Spieler auf: Tritt dem nächsten bei.

> Autodarts hat Bob keinen Platz gegeben: Die Lobby ist vielleicht voll, geschlossen oder schon gestartet.

**Was es bedeutet:** Autodarts hat den Platz abgelehnt: Die Lobby hat so viele Spieler, wie sie aufnimmt, ihr Gastgeber hat sie geschlossen, oder ihr Match hat begonnen. Sonst hat sich nichts geändert, und Bobs Sitzung bleibt geparkt und bereit.

**Was du tust:** Sieh dir die Lobby auf der Autodarts-Seite an. Mach in einer vollen Lobby Platz oder öffne eine neue, und tippe dann noch einmal auf **Der Lobby beitreten**.

> Bob spielt schon auf der Seite: dort auf Autodarts der Lobby beitreten.

**Was es bedeutet:** Bob ist gerade der Spieler auf der Seite. Seine Sitzung dort gehört der Seite, und die Erweiterung benutzt sie nie hinter deren Rücken, darum setzt sie nur geparkte Spieler in die Lobby; die Kachel des Spielers auf der Seite bietet keinen Beitritt an.

**Was du tust:** Bob tritt der Lobby auf der Autodarts-Seite selbst bei, falls er noch nicht darin ist, etwa wenn die Lobby nach einem Wechsel auf dem Bildschirm geblieben ist.

### Player Switch wurde aktualisiert {#updated}

> Player Switch wurde aktualisiert. Die Seite neu laden, um es zu nutzen? Ein laufendes Match endet auf diesem Bildschirm.

**Was es bedeutet:** Die Erweiterung wurde aktualisiert, und dieser Tab hat noch den Knopf der Version davor, weil die neue Version ihn nicht übernehmen konnte. In der Regel übernimmt die neue Version die offenen Autodarts-Tabs von selbst; diese Frage kommt nur dort, wo das nicht geklappt hat. Der alte Knopf kann die Seite nur neu laden, und auf einer Match-Seite beendet das das Match, deshalb fragt er vorher; auf einer Seite ohne Match lädt ein Tipp auf ihn die Seite sofort neu. Das Popup von Player Switch in der Symbolleiste und die Tastenkombination **Alt+Shift+O** bringen die neue Version ohne Neuladen in den Tab.

**Was du tust:** **OK** lädt die Seite mit der neuen Version neu. **Abbrechen** lässt die Seite, wie sie ist; um ein laufendes Match zu behalten, drücke **Alt+Shift+O** oder öffne das Popup in der Symbolleiste, dann übernimmt die Erweiterung den Tab ohne Neuladen.

### Autodarts hat vielleicht geändert, wie die Anmeldung funktioniert {#sign-in-changed}

> Autodarts hat vielleicht geändert, wie die Anmeldung funktioniert. Schau, ob es ein Update von Player Switch gibt.

**Was es bedeutet:** Bei einer Erneuerung hat Autodarts alle geparkten Konten auf einmal abgewiesen, mindestens zwei. Ein einzelnes Konto kann seine Sitzung auch allein verlieren; alle zur selben Zeit heißt eher, dass Autodarts die Anmeldung geändert hat und die Erweiterung dafür ein Update braucht.

Dasselbe sagt das Popup sofort und noch bevor sich jemand neu anmelden muss, wenn Autodarts die Erneuerung selbst abgelehnt hat, wie es das tut, wenn seine Anmeldung etwas verlangt, das die Erweiterung noch nicht schickt. Die Erweiterung behält dann jede geparkte Sitzung und erneuert sie nur nicht mehr, sodass sich die Spieler nicht neu anmelden müssen; **Konten verwalten** zeigt, seit wann die Erneuerung fehlschlägt. Aktualisiere bald, bevor Autodarts die behaltenen Sitzungen ablaufen lässt.

**Was du tust:** Melde noch nicht alle neu an. **Bekannte Probleme und Updates** öffnet die Liste der bekannten Probleme. Chrome holt eine neue Version einer Erweiterung innerhalb weniger Stunden von selbst; um sie gleich zu holen, schalte unter `chrome://extensions` den **Entwicklermodus** ein und wähle **Aktualisieren**. Unten in den Spielern und im Popup steht, [welche Version läuft](#which-version). Entpackt installiert? Dann holt Chrome nichts von selbst: Ersetze den Inhalt des Ordners durch den des Zip-Archivs des [neuesten Releases](https://github.com/Dennis-Otto/player-switch-for-autodarts/releases/latest), oder hol den neuesten Quellcode (`git pull`) und führe `npm run build` aus, und wähle unter `chrome://extensions` den Pfeil zum Neuladen von Player Switch, wie im [Schnellstart der README](https://github.com/Dennis-Otto/player-switch-for-autodarts#quick-start). Ist die neue Version da, melde nur die Konten neu an, die es dann noch zeigen.

### Erneuert vor 3 Stunden {#renewed}

> Erneuert vor 3 Stunden

**Was es bedeutet:** Unter **Konten verwalten** steht, wann die Erweiterung die geparkte Sitzung eines Kontos zuletzt erneuert hat. Das Konto, das gerade spielt, zeigt keine Zeit, weil die Autodarts-Seite seine Sitzung selbst erneuert.

**Was du tust:** Nichts. Die Erweiterung erneuert jedes geparkte Konto alle 12 Stunden, solange der Browser läuft. Liegt die Zeit viel länger zurück, war der Computer aus oder im Ruhezustand: Die Erneuerung holt das nach, sobald der Browser wieder startet oder der Computer aufwacht. [Bereit halten](shared-display.md#keep-it-ready) sagt, was das für ein Display heißt, das tagelang aus ist.

### Erneuern klappt nicht {#renewal-failing}

> Erneuern klappt seit 22.10.2026, 21:15 nicht; es wird weiter versucht.

**Was es bedeutet:** Unter **Konten verwalten** steht, dass die Erweiterung Autodarts seit diesem Zeitpunkt bei keinem Versuch erreicht hat, um die geparkte Sitzung dieses Kontos zu erneuern. Die Sitzung selbst bleibt gespeichert; Autodarts hat sie nicht abgelehnt.

**Was du tust:** Prüfe, ob der Computer online ist und [Autodarts](https://play.autodarts.com) sich öffnet. Die Erweiterung versucht es alle 15 Minuten wieder, und die Zeile verschwindet mit der ersten Erneuerung, die klappt. Lehnt Autodarts die Sitzung später ab, zeigt die Kachel **Neu anmelden**; siehe [Neu anmelden](#sign-in-again).

### Gespeicherte Konten aus einer neueren Version {#newer-version}

> Die gespeicherten Konten stammen aus einer neueren Version von Player Switch. Aktualisiere die Erweiterung, um sie zu nutzen; diese Version lässt sie unverändert.

**Was es bedeutet:** Eine neuere Version der Erweiterung hat die Konten in einem Format gespeichert, das diese ältere Version nicht lesen kann, etwa nach dem Wechsel zurück auf eine ältere Version oder nach der Installation einer älteren Kopie aus dem Quellcode. Diese Version ändert und löscht sie nicht: Sie behält sie, wie sie sind, dazu eine Kopie, und zeigt kein Konto, bis wieder eine Version läuft, die sie lesen kann.

**Was du tust:** Aktualisiere die Erweiterung wie unter [Autodarts hat vielleicht geändert, wie die Anmeldung funktioniert](#sign-in-changed). Sobald die neuere Version läuft, sind alle Konten wieder da. Entferne die Erweiterung nicht, um die Meldung loszuwerden: Das löscht auch die gespeicherten Konten, und jeder Spieler muss sich neu anmelden.

### Noch keine Konten {#no-accounts}

> Noch keine Konten. Wähle „Konto hinzufügen“ und melde dich auf Autodarts an: Jedes Konto wird von selbst gespeichert.

**Was es bedeutet:** Die Erweiterung behält noch kein Konto, in diesem Browserprofil.

**Was du tust:** Wähle **Konto hinzufügen** und melde dich auf Autodarts als erster Spieler an. Das Konto wird von selbst gespeichert, und das Symbol zeigt kurz ✓. Die nächsten Spieler fügst du genauso hinzu.

### Einen Spieler entfernen {#remove}

> Bob von diesem Display entfernen? Die Sitzung bei Autodarts endet ebenfalls. Zum Wiederherstellen einfach neu anmelden.

**Was es bedeutet:** **Konto entfernen** unter **Konten verwalten** fragt das, bevor es das Konto aus der Erweiterung löscht, mit seiner gespeicherten Sitzung und einem gemerkten Passwort. Vorher meldet es das Konto bei Autodarts ab, damit keine Kopie der Sitzung mehr funktioniert, etwa in einer Sicherung des Computers. Spielt der Spieler gerade auf der Seite, meldet sich auch die Seite ab; während eines Matches fragt die Erweiterung vorher.

**Was du tust:** Bestätige, um es zu entfernen. Das Popup sagt dann „Bob ist entfernt und bei Autodarts abgemeldet.“

### Autodarts ist beim Entfernen nicht erreichbar {#removed-offline}

> Bob ist von diesem Display entfernt. Autodarts ist nicht erreichbar, daher endet die Sitzung dort erst, wenn sie abläuft.

oder nach **Alle Konten vergessen**:

> Alle Konten sind auf diesem Display vergessen. Autodarts ist nicht erreichbar, daher enden ihre Sitzungen dort erst, wenn sie ablaufen.

**Was es bedeutet:** Die Erweiterung hat das Konto oder alle Konten vergessen, mit den Sitzungen und den gemerkten Passwörtern, aber Autodarts hat auf die Abmeldung nicht geantwortet, etwa weil das Internet oder Autodarts gerade ausgefallen ist. Die Erweiterung behält keine Kopie der Sitzung, also kann niemand von diesem Display aus damit spielen; Autodarts würde sie annehmen, bis sie abläuft.

**Was du tust:** Nichts muss passieren. Bevor ein Display den Besitzer wechselt, wähle **Alle Konten vergessen**, solange Autodarts erreichbar ist, damit jede Sitzung sofort endet.

### Alle Konten vergessen {#forget-all}

> Jedes Konto wird bei Autodarts abgemeldet und mit seinem gemerkten Passwort von diesem Display entfernt. Die PINs und die Einstellungen beginnen wie nach der Installation von vorn.

**Was es bedeutet:** **Alle Konten vergessen**, unter den Spielern in **Konten verwalten**, fragt das, bevor es die Erweiterung leert, etwa bevor ein Display verkauft, verschenkt oder aus einem Verein abgegeben wird. Es meldet jedes gespeicherte Konto bei Autodarts ab, auch den Spieler auf der Seite, und löscht dann alles, was die Erweiterung speichert: die Konten, die gemerkten Passwörter, den Schlüssel, der sie versiegelt, die PINs für Verein und Kneipe und die Einstellungen. Ist eine Manager-PIN gesetzt, fragt es zuerst nach ihr.

**Was du tust:** Bestätige, um sie zu leeren. Das Popup sagt dann „Alle Konten sind vergessen und bei Autodarts abgemeldet.“, und die Erweiterung ist wie nach der Installation: **Konto hinzufügen** speichert den nächsten Spieler. Eine Sitzung auf der Seite, die die Erweiterung nie gespeichert hat, bleibt; melde sie auf Autodarts ab.

### Nicht festgelegt {#shortcut-not-set}

Unter **Einstellungen** steht bei einem Tastenkürzel:

> Nicht festgelegt

**Was es bedeutet:** Das Tastenkürzel hat keine Tasten, weil eine andere Erweiterung sie zuerst hatte oder sie entfernt wurden.

**Was du tust:** **Tastenkürzel ändern** öffnet die Tastenkürzel des Browsers: `chrome://extensions/shortcuts` in Chrome, `edge://extensions/shortcuts` in Edge, und in Firefox `about:addons`, wo das Zahnradmenü **Tastenkürzel für Erweiterungen verwalten** hat; gib ihm Tasten, die keine andere Erweiterung nutzt. Der Knopf auf der Autodarts-Seite geht auch ohne Tastenkürzel.

### Die PIN eines Spielers {#player-pin}

> PIN von Bob
>
> Dieses Konto fragt nach seiner PIN, bevor jemand damit spielt.

**Was es bedeutet:** Am Display ist der [Modus für Verein und Kneipe](shared-display.md#venue-mode) an, und das Konto hat eine PIN bekommen, vom Manager auf der Seite der Einstellungen oder von seinem Spieler mit [**Mit einer PIN schützen**](shared-display.md#own-account). Die Erweiterung fragt vor einem Wechsel zu diesem Konto nach ihr, im Popup wie auf der Autodarts-Seite.

**Was du tust:** Tippe die PIN auf dem Ziffernblock oder mit der Tastatur ein und wähle **OK**. **Abbrechen** ändert nichts. Eine vergessene PIN steht nirgends: Der Manager entfernt sie oder legt eine neue fest, unter **Einstellungen** → **Für Verein und Kneipe** → **PINs der Spieler**, wenn die Manager-PIN sie gesetzt hat. Eine PIN, die der Spieler ohne Manager-PIN gesetzt hat, ändert sich nur mit ihr selbst: Das Konto wird dann unter **Konten verwalten** entfernt und neu hinzugefügt ([wer die PIN eines Spielers ändert](shared-display.md#change-a-pin)).

### Mein Konto entfernen {#remove-own}

> PIN von Bob
>
> Gib die PIN dieses Kontos ein, um es von diesem Display zu entfernen.

**Was es bedeutet:** An einem Display mit Manager-PIN hat der Spieler eines Kontos mit PIN unter dessen Kachel **Mein Konto entfernen** gewählt und Ja gesagt. Die PIN des Kontos entfernt es ohne den Manager: Die Erweiterung meldet es bei Autodarts ab und vergisst es, mit seiner PIN, [wie die Anleitung zeigt](shared-display.md#own-account).

**Was du tust:** Tippe die PIN des Kontos ein und wähle **OK**. **Abbrechen** behält das Konto. Eine vergessene PIN steht nirgends: Der Manager entfernt das Konto unter **Konten verwalten**.

### Die PIN eines Spielers ändern {#change-pin}

> PIN von Bob
>
> Gib die PIN ein, die dieses Konto jetzt hat, um sie zu ändern oder zu entfernen.

**Was es bedeutet:** Jemand hat unter **PINs der Spieler** eine neue PIN für ein Konto gewählt, das schon eine hat, oder **PIN entfernen**. Die PIN eines Spielers ändert oder entfernt sich nur mit ihr selbst, auch ohne Manager-PIN, außer die Manager-PIN hat sie gesetzt, [wie die Anleitung erklärt](shared-display.md#change-a-pin).

**Was du tust:** Tippe die PIN ein, die das Konto jetzt hat, und wähle **OK**; dann gilt die neue PIN oder keine. **Abbrechen** lässt die PIN, wie sie ist. Eine falsche PIN zählt zu den fünf, die jede PIN für eine Minute sperren. Eine vergessene PIN steht nirgends: Das Konto wird unter **Konten verwalten** entfernt und neu hinzugefügt.

### Falsche PIN {#wrong-pin}

> Falsche PIN. Bitte nochmal versuchen.

**Was es bedeutet:** Die PIN stimmt nicht. Am Display hat sich nichts geändert.

**Was du tust:** Tippe die PIN noch einmal ein. Nach fünf falschen PINs in Folge wartet jede PIN des Displays eine Minute.

### Eine PIN hat 4 bis 8 Ziffern {#pin-digits}

> Eine PIN hat 4 bis 8 Ziffern.

**Was es bedeutet:** Die Eingabe ist kürzer als 4 Ziffern, länger als 8 oder enthält etwas anderes als Ziffern.

**Was du tust:** Tippe 4 bis 8 Ziffern ein und wähle **OK**.

### Zu viele falsche PINs {#pin-locked}

> Zu viele falsche PINs. Bitte in einer Minute nochmal versuchen.

**Was es bedeutet:** Fünf falsche PINs in Folge sperren jede PIN dieses Displays, die der Spieler und die des Managers, für eine Minute, damit niemand sie alle von Hand durchprobieren kann. Eine richtige PIN dazwischen beendet die Folge nicht, erst eine Minute ohne falsche PIN.

**Was du tust:** Warte eine Minute und tippe dann die richtige PIN ein.

### Die Manager-PIN {#manager-pin}

> Manager-PIN
>
> Gib die Manager-PIN ein, um die Konten und die Einstellungen zu verwalten.

**Was es bedeutet:** Eine Manager-PIN schützt **Konten verwalten**: ein Konto entfernen, ein Passwort merken oder vergessen. Die Erweiterung fragt einmal nach ihr, wenn **Konten verwalten** aufgeht, und vergisst sie, wenn es wieder zugeht. Sein eigenes Konto schützt oder entfernt ein Spieler ohne sie, mit **Mit einer PIN schützen** und **Mein Konto entfernen** ([eigenes Konto](shared-display.md#own-account)).

**Was du tust:** Der Manager tippt sie ein. Vergessen? Die PIN steht nirgends, aber wer den Computer benutzen kann, kann den Modus für Verein und Kneipe ausschalten, wie die [Anleitung für ein gemeinsames Display](shared-display.md#forgotten-manager-pin) zeigt; die Konten bleiben.

### Einstellungen gesperrt {#settings-locked}

Unter **Einstellungen**:

> Eine Manager-PIN schützt diese Einstellungen. Gib sie ein, um sie zu ändern.

**Was es bedeutet:** Eine Manager-PIN ist gesetzt, deshalb zeigt die Seite der Einstellungen nichts anderes, bis sie die PIN bekommt.

**Was du tust:** Wähle **Entsperren** und tippe die Manager-PIN ein.

### Die beiden PINs sind verschieden {#pin-mismatch}

> Die beiden PINs sind verschieden. Wähle die PIN noch einmal.

**Was es bedeutet:** Eine neue PIN wird zweimal abgefragt, damit ein Tippfehler niemanden aussperrt, und die beiden Eingaben stimmten nicht überein. Nichts wurde gespeichert.

**Was du tust:** Tippe die neue PIN ein und dieselben Ziffern noch einmal.

## Fragen

### Meldet ein Wechsel den anderen Spieler ab?

Nein. Das Konto, das Platz macht, behält seine Sitzung, geparkt in der Erweiterung und bei Autodarts weiter gültig, und ein Tipp bringt es sofort zurück. Nur eine Abmeldung auf der Autodarts-Seite beendet eine Sitzung, darum wechselst du die Spieler mit einer Kachel.

### Muss jemand ein Passwort eintippen?

Einmal pro Spieler, um sich auf Autodarts anzumelden, so wie immer: mit Passwort, Google oder Apple. Danach wechselt ein Tipp, ohne Passwort. **Passwort merken** ist freiwillig: Die Erweiterung meldet das Konto dann von selbst an, falls seine gespeicherte Sitzung einmal nicht mehr geht.

### Konten, die sich mit Google oder Apple anmelden {#google-or-apple}

Sie funktionieren wie jedes andere Konto: Nach **Konto hinzufügen** meldest du dich auf Autodarts mit Google oder Apple an, und die Sitzung wird gespeichert. So ein Konto kann **Passwort merken** nicht nutzen, weil es kein Autodarts-Passwort hat, das sich merken ließe; muss es sich neu anmelden, meldet es sich noch einmal über **Konto hinzufügen** an.

Eine Anmeldung mit Google oder Apple an einem gemeinsamen Display kann die Person in diesem Browser bei Google oder Apple angemeldet lassen. Melde dich dort danach ab, damit die nächste Person am Display nicht in dieses Konto kommt; die gespeicherte Autodarts-Sitzung braucht das nicht. Und wenn Chrome am Display anbietet, ein Passwort zu speichern, wähle **Nie**.

### Wie lange bleibt ein gespeichertes Konto bereit?

So lange, wie Autodarts seine Sitzung gelten lässt, und das bestimmt Autodarts. Die Erweiterung erneuert jedes geparkte Konto alle 12 Stunden, solange der Browser läuft, darum geht ein gespeichertes Konto an einem Display, das täglich läuft, auch Wochen später noch. **Konten verwalten** zeigt, wann jedes zuletzt erneuert wurde.

### Eine neue Anmeldung wurde nicht von selbst gespeichert

Die Erweiterung speichert eine Anmeldung nur in den zehn Minuten nach **Konto hinzufügen** oder der Installation von selbst, nur einmal und nur, solange kein gespeichertes Konto spielt. Jede andere Anmeldung zeigt ein `+` am Symbol, und **Konto speichern** im Popup speichert sie. **Abbrechen** beendet das Warten. In Firefox prüfe auch [den Zugriff auf die Autodarts-Seiten](#firefox-site-access).

### Der Knopf auf der Autodarts-Seite fehlt

**Einstellungen** im Popup, oder **Details → Erweiterungsoptionen** unter `chrome://extensions` (`edge://extensions` in Edge, **Einstellungen** von Player Switch unter `about:addons` in Firefox), blendet den Knopf ein und wählt seine Ecke. Ist er an und fehlt trotzdem? Lade die Autodarts-Seite neu. Das Tastenkürzel <kbd>Alt</kbd>+<kbd>Umschalt</kbd>+<kbd>O</kbd> öffnet die Spieler auch ohne Knopf. In Firefox prüfe auch [den Zugriff auf die Autodarts-Seiten](#firefox-site-access).

### In Firefox fehlt der Knopf, und keine Anmeldung wird gespeichert {#firefox-site-access}

Das Add-on braucht seinen Zugriff auf die beiden Autodarts-Seiten: auf die Seite für den Knopf, die Wechsel und die Anmeldungen, und auf den Anmeldedienst für die Sitzungen. Firefox gibt ihn dem Add-on schon beim Laden, du musst nichts erlauben, und zeigt ihn auf der Seite des Add-ons als zwei Schalter, die sich ausschalten lassen. Ohne den Zugriff auf die Seite fehlt der Knopf, und keine Anmeldung wird gespeichert; ohne den Zugriff auf den Anmeldedienst kann ein Wechsel oder **Konto hinzufügen** [Autodarts ist gerade nicht erreichbar](#unreachable) melden, obwohl `play.autodarts.com` lädt. Öffne `about:addons`, wähle Player Switch for Autodarts, dann **Berechtigungen und Daten**, und schalte **Auf Ihre Daten für `https://play.autodarts.com` zugreifen** und **Auf Ihre Daten für `https://api.autodarts.com` zugreifen** beide ein. Lade dann die Autodarts-Seite neu.

### Nach einem Wechsel fehlt das Board {#board-not-shared}

Autodarts zeigt ein Board nur dem Konto, dem es gehört, und den Konten, mit denen sein Besitzer es teilt. Nach einem Wechsel zu einem Spieler, mit dem das Board nicht geteilt ist, zeigt Autodarts diesem Spieler kein Board, und er kann darauf kein Spiel starten. Die Erweiterung kann daran nichts ändern: Wer ein Board sieht, entscheidet Autodarts, und der Wechsel selbst hat geklappt.

**Was tun:** Der Besitzer des Boards meldet sich bei Autodarts an und teilt das Board mit diesem Spieler, über dessen genauen Autodarts-Benutzernamen, denn Autodarts schlägt keine Namen vor. In der englischen Ansicht von Autodarts heißt die Seite dafür **My Boards**. Wechsle danach noch einmal zu dem Spieler, oder lade die Autodarts-Seite neu, und das Board ist da. Ein Besitzer kann ein Board mit bis zu 10 weiteren Konten teilen, die es wie ihr eigenes nutzen, es aber nicht umbenennen, löschen oder neue Zugangsdaten dafür erzeugen können, so steht es in der Ankündigung [Board sharing](https://web.archive.org/web/20250430030721/https://autodarts.io/updates/board-sharing) von Autodarts vom 4. März 2025. Teile das Board einmal mit jedem gespeicherten Konto, am besten, während du die Spieler speicherst: Die Willkommensseite der Installation bittet darum als letzten Schritt.

**Im Verein oder in der Kneipe** gehört das Board am besten einem Autodarts-Konto des Lokals, nicht dem Konto eines Mitglieds: Dann bleibt das Board, wenn ein Mitglied geht, und dieses Hauskonto teilt es mit den Stammspielern. Der [Modus für Verein und Kneipe](shared-display.md#venue-mode) bringt das Display nach einer Pause zu ihm zurück. Hat das Lokal mehr Stammspieler als die 10 Konten, die Autodarts erlaubt? Die anderen spielen unter dem Hauskonto.

### Zwei Spieler, jeder mit eigener Statistik {#two-players}

Autodarts zählt ein Match für jedes Konto, das in seiner Lobby sitzt, während die Seite nur unter einem Konto spielt. Ohne Player Switch tritt der zweite Spieler über sein eigenes Handy bei oder spielt als Gast, dessen Statistik für niemanden zählt. Mit Player Switch:

1. Der Spieler auf der Seite öffnet bei Autodarts eine Lobby, am Board des Displays. Die Kacheln bieten den Beitritt an, sobald der Tab die Lobby selbst zeigt, unter `play.autodarts.com/lobby/…`, noch nicht, solange er die Liste der offenen Lobbys oder die Einstellungen einer neuen zeigt.
2. Die Kachel jedes geparkten Spielers, der mitspielt, zeigt im Popup oder in den Spielern auf der Seite **Der Lobby beitreten**: Ein Tipp darauf setzt diesen Spieler in die Lobby. Im [Modus für Verein und Kneipe](shared-display.md#venue-mode) tippt ein Spieler mit PIN sie vorher ein.
3. Seine Kachel zeigt **In der Lobby**. Nichts wechselt und nichts lädt neu: Die Seite bleibt beim Spieler, der dort spielt.
4. Starte das Match wie gewohnt auf der Seite. Es zählt für das eigene Konto jedes Spielers.

Die Erweiterung setzt den Spieler mit der Sitzung, die sie für ihn geparkt hält, an das Board des Displays, und diese Sitzung gelangt nie in die Seite. Eine Kachel, die **Neu anmelden** zeigt, bietet keinen Beitritt an, bis sich dieses Konto neu angemeldet hat. Die Kachel zeigt **In der Lobby**, bis der Browser schließt oder der Tab eine andere Lobby zeigt, auch wenn jemand den Spieler bei Autodarts aus der Lobby nimmt: Die Erweiterung beobachtet die Lobby nicht. Dann tippe auf **Erneut beitreten** unter der Kachel: Es setzt den Spieler noch einmal in die Lobby und ändert nichts für einen Spieler, der noch dort sitzt.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/join-a-lobby.de.dark.svg">
  <img src="images/diagrams/join-a-lobby.de.svg" alt="Mit einem geparkten Spieler der Lobby beitreten: Ada spielt auf der Seite und öffnet bei Autodarts eine Lobby am Board des Displays. Auf dieser Seite bietet die Kachel jedes geparkten Spielers im Popup und im Wechsler Der Lobby beitreten an. Ein Tipp bei Bob, oder später auf Erneut beitreten unter seiner Kachel, erneuert seine geparkte Sitzung und speichert zuerst den neuen Token. Ist seine Sitzung abgelaufen oder Autodarts nicht erreichbar, sagt seine Kachel, warum, und sonst ändert sich nichts. Andernfalls liest die Erweiterung die Lobby mit seinem eigenen Zugangstoken, der nie in die Seite gelangt. Sitzt Bob schon dort, sagt das Popup das, und Autodarts bekommt keinen zweiten Platz. Andernfalls setzt die Erweiterung Bob an das Board des Displays. Lehnt Autodarts den Platz ab, weil die Lobby voll, geschlossen oder gestartet ist, sagt das Popup das. Andernfalls zeigt seine Kachel In der Lobby, darunter Erneut beitreten für den Fall, dass der Gastgeber ihn herausnimmt, die Seite bleibt ohne Wechsel und ohne Neuladen bei Ada, und das Match zählt für beide Konten.">
</picture>

### Wer kann unter meinem Konto spielen?

Jede Person an diesem Display kann zu jedem dort gespeicherten Konto wechseln: Die Erweiterung ist für ein Display gemacht, das sich die Menschen eines Haushalts, eines Vereins oder eines Lokals teilen und dem sie vertrauen. In einem Verein oder einer Kneipe gibt der [Modus für Verein und Kneipe](shared-display.md#venue-mode) deinem Konto eine PIN, nach der das Display fragt, bevor jemand damit spielt. Du verlässt einen Verein oder spielst ab jetzt woanders? Entferne dein Konto vom Display, unter **Konten verwalten**. Das [Sicherheitsdesign](security.md) zählt auf, was gespeichert wird und welche Risiken bleiben.

### Das Display hat von selbst zu einem anderen Spieler gewechselt {#returned-after-break}

Der [Modus für Verein und Kneipe](shared-display.md#venue-mode) kann das Display nach einer Pause ohne Tippen, Klicken oder Taste auf der Autodarts-Seite zu einem Hauskonto zurückbringen oder abmelden, damit die nächsten Spiele nicht für den Spieler zählen, der gegangen ist. Ein Match unterbricht er nie: Die Pause beginnt erst, wenn es zu Ende ist. Eine Lobby, die auf Spieler wartet, hält das Display dreimal so lang wie die Pause. Der Spieler davor behält seine Sitzung geparkt, ein Tipp holt ihn zurück. **Einstellungen** → **Für Verein und Kneipe** → **Zurück nach einer Pause** legt fest, wie lang die Pause ist, oder schaltet es aus.

### Mehrere Displays

Jedes Browserprofil auf jedem Computer behält seine eigenen Konten, und nichts wird zwischen ihnen abgeglichen. Melde jeden Spieler an jedem Display einmal an; jedes Display behält dann eine eigene Sitzung für ihn.

### In welchen Browsern geht es?

Die Erweiterung ist für Google Chrome 140 oder neuer gemacht, unter Windows, macOS, Linux und ChromeOS, und kommt aus [dem Chrome Web Store](https://chromewebstore.google.com/detail/player-switch-for-autodar/gbijblgchbbbkjeibpjaodflfgbgefam?hl=de), der jedes Update von selbst bringt. Browser, die auf Chromium aufbauen, installieren sie ebenso von dort, etwa Chromium auf einem Raspberry Pi, Brave, Opera oder Vivaldi, und Microsoft Edge, sobald unter `edge://extensions` **Erweiterungen aus anderen Stores zulassen** eingeschaltet ist. Firefox 140 oder neuer führt sie auch aus, als temporäres Add-on aus einem Release geladen, denn auf addons.mozilla.org ist sie nicht gelistet: [Welche Browser](index.md#browsers) sagt, wie. Nutze ein normales Fenster eines Browserprofils: Chrome führt in einem Gastfenster keine Erweiterung aus, und in einem Inkognitofenster nur, wenn du es erlaubst.

### Welche Version läuft? {#which-version}

Unten in den Spielern auf der Autodarts-Seite, neben dem Hinweis zu den Tasten, und unten im Popup, unter seinen Links, steht, welche Version der Erweiterung auf diesem Display läuft, etwa *Player Switch 1.6.0*. Die Erweiterung liest sie aus sich selbst, also kann sie älter sein als die neueste Version, die der Chrome Web Store und die [Releases](https://github.com/Dennis-Otto/player-switch-for-autodarts/releases) schon zeigen: Chrome sucht nur alle paar Stunden von selbst nach Updates seiner Erweiterungen. Um ein Update gleich zu holen, schalte unter `chrome://extensions` (`edge://extensions` in Edge) den **Entwicklermodus** ein und wähle **Aktualisieren**; öffne dann die Spieler wieder, und sie zeigen die neue Nummer. Eine entpackt installierte Kopie bekommt kein Update von selbst: [Autodarts hat vielleicht geändert, wie die Anmeldung funktioniert](#sign-in-changed) sagt, wie die neue Version hineinkommt. Das temporäre Add-on in Firefox auch nicht: Lade das Zip-Archiv des neuen Releases, wie [Welche Browser](index.md#browsers) es sagt. Was jede Version geändert hat, steht im [Changelog](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CHANGELOG.md).

### Alles entfernen

- **Ein Konto:** **Konten verwalten**, das Konto, **Konto entfernen**. Das meldet es bei Autodarts ab und löscht seine gespeicherte Sitzung und ein gemerktes Passwort.
- **Nur ein Passwort:** **Passwort nicht mehr merken** löscht es, und das Konto bleibt.
- **Alles:** **Konten verwalten**, [**Alle Konten vergessen**](#forget-all). Das meldet jedes Konto bei Autodarts ab und löscht alles, was die Erweiterung gespeichert hat, auch die PINs und die Einstellungen.
- **Die Erweiterung selbst:** Entferne sie unter `chrome://extensions` (`edge://extensions` in Edge, **Entfernen** im Menü von Player Switch unter `about:addons` in Firefox), und der Browser löscht alles, was sie gespeichert hat. Das meldet niemanden bei Autodarts ab: Die geparkten Sitzungen laufen weiter, bis sie ablaufen, und wer zuletzt gespielt hat, bleibt auf der Autodarts-Seite angemeldet, bis er sich dort abmeldet. Wähle deshalb zuerst **Alle Konten vergessen**.

Die [Datenschutzerklärung](privacy.md) zählt alles auf, was die Erweiterung speichert.

## Immer noch ein Problem?

**Problem melden** unten im Popup öffnet das [Fehlerformular](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/new?template=bug_report.yml), mit den Versionen der Erweiterung und des Browsers. Fragen gehören in die [Diskussionen](https://github.com/Dennis-Otto/player-switch-for-autodarts/discussions), und eine Sicherheitslücke meldest du vertraulich, wie [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md) es beschreibt. Das Fehlerformular und die Diskussionen sind auf Englisch.
