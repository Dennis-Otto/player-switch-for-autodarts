# Roadmap

Was Player Switch in den nächsten zwölf Monaten vorhat, bis November 2027, und was es nicht tun wird. Das ist eine Richtung, kein Versprechen. Ideen sind als [Feature-Wunsch](https://github.com/Dennis-Otto/player-switch-for-autodarts/issues/new?template=feature_request.yml) willkommen.

## Die nächsten zwölf Monate

Die Erweiterung tut, wofür sie gebaut wurde: ein gemeinsames Autodarts-Display, jeder mit seinem eigenen Konto, ein Tippen zum Wechseln. Zwei größere Vorhaben sind geplant:

- **Der Modus für Verein und Kneipe in Firefox so sicher wie in Chrome.** Firefox kann den Speicher der Erweiterung nicht vor ihrem Skript in der Autodarts-Seite verbergen. Darum ziehen die Namen der gespeicherten Konten, die Einstellungen und die Hashes der PINs in die IndexedDB der Erweiterung, neben den Schlüssel der versiegelten Sitzungen, wohin dieses Skript nicht reicht ([das Sicherheitsdesign](security.md#firefox), [Entscheidung 0012](decisions/0012-run-one-package-in-chrome-edge-and-firefox.md), auf Englisch).
- **Einträge in Edge Add-ons und auf addons.mozilla.org,** nach diesem Umzug, sobald der Maintainer die Konten der beiden Stores eröffnet hat ([was sie brauchen](releases.md#edge-and-firefox), auf Englisch). Bis dahin installiert Edge aus dem Chrome Web Store, und Firefox lädt [das Zip-Archiv eines Releases](index.md#install-from-a-release).

Darüber hinaus geht es in diesem Jahr darum, dass sie funktioniert und sicher bleibt:

- **Jede Änderung von Autodarts.** Wie die Erweiterung eine Sitzung behält, ist keine offizielle Schnittstelle von Autodarts. Der Workflow Upstream prüft diesen Vertrag jeden Morgen, und die End-to-End-Tests laufen jeden Tag im nächsten Chrome, sodass sich eine Änderung meist zeigt, bevor die Spieler sie sehen ([was Autodarts und das nächste Chrome ändern](development.md#what-autodarts-and-the-next-chrome-change), auf Englisch). Eine Änderung, die das Wechseln bricht, wird zuerst behoben, mit einem Test, der sie behoben hält.
- **Jede neue Version von Chrome, Edge und Firefox,** ab Chrome und Edge 140 und Firefox 153, in einem Paket für alle, jeden Morgen in den ältesten davon und im nächsten Chrome und Firefox getestet.
- **Fehler und Sicherheit.** Gemeldete Fehler und Sicherheitslücken haben Vorrang vor allem Neuen; [SECURITY.md](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/SECURITY.md) nennt die Fristen.
- **Aktuelle Abhängigkeiten und Werkzeuge,** durch die Update-Bots und den [Repository-Blueprint](https://github.com/Dennis-Otto/repo-blueprint).

Feature-Wünsche mit den meisten Reaktionen kommen als Nächstes dran, in dieser Reihenfolge: zuerst alles, was für Spieler kaputtgeht, dann, was die gespeicherten Konten sicherer macht, dann der Rest.

## Erledigt

Die größeren Vorhaben der letzten Releases; das [Changelog](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/CHANGELOG.md) enthält jede Änderung.

- **Zwei Spieler, jeder mit eigener Statistik:** Ein geparkter Spieler [tritt mit einem Tippen der Lobby](index.md#join-a-lobby) am Board bei, ohne Handy und ohne Anmeldung ([Entscheidung 0016](decisions/0016-join-a-lobby-with-a-parked-session.md)), und die Willkommensseite erinnert den Besitzer daran, [das Board](help.md#board-not-shared) mit jedem gespeicherten Spieler zu teilen.
- **Ein Paket für jeden Browser:** Chrome und Edge ab Version 140 und Firefox ab 153 führen dasselbe Zip-Archiv aus, von `web-ext lint` geprüft und in einem echten Firefox getestet ([welche Browser](index.md#browsers), [Entscheidung 0012](decisions/0012-run-one-package-in-chrome-edge-and-firefox.md)).
- **Ein Zip-Archiv für die Spieler und den Store:** Jedes Release bringt die Erweiterung fertig zum Laden mit, der Chrome Web Store bekommt genau diese Datei nach einer Prüfung ihrer signierten Herkunft, und jeder kann sie aus den Quellen ihres Tags [Byte für Byte nachbauen](releases.md#rebuild-a-release) ([Entscheidung 0013](decisions/0013-send-the-store-the-zip-that-the-release-attests.md), auf Englisch).
- **Bereit für Verein und Kneipe:** der [Modus für Verein und Kneipe](shared-display.md#venue-mode) mit einer Manager-PIN, einer PIN für jeden Spieler und der Rückkehr zu einem Hauskonto nach einer Pause ([Entscheidung 0008](decisions/0008-lock-a-venue-display-with-pins-that-the-worker-checks.md)).
- **Versiegelte Sitzungen und Passwörter:** mit einem Schlüssel, den der Browser für die Erweiterung behält und nie herausgibt ([das Sicherheitsdesign](security.md#versiegelte-tokens-und-passwörter), [Entscheidung 0006](decisions/0006-seal-the-secrets-with-a-key-that-never-leaves-the-browser.md)).
- **Fünf Sprachen:** Die Erweiterung spricht Deutsch, Englisch, Niederländisch, Französisch und Spanisch, die Hilfe und diese Website Deutsch und Englisch.

## Nicht geplant

- **Ein Server, ein Konto oder eine Analyse von uns.** Alles bleibt im Browser auf diesem Computer und geht nur an Autodarts ([Datenschutz](privacy.md)).
- **Gespeicherte Konten, die einem Spieler auf einen anderen Computer folgen.** Die Sitzungen sind mit einem Schlüssel versiegelt, der den Browser, der sie gespeichert hat, nie verlässt ([Entscheidung 0006](decisions/0006-seal-the-secrets-with-a-key-that-never-leaves-the-browser.md)). Darum speichert jedes Display seine eigenen Spieler.
- **Eine Anmeldung mit dem Passwort bei jedem Wechsel.** Ein Wechsel tauscht die geparkte Sitzung ([Entscheidung 0002](decisions/0002-swap-the-session-not-the-login.md)); ein gemerktes Passwort meldet ein Konto nur dann wieder an, wenn seine Sitzung nicht mehr funktioniert.
- **Alles am Spiel selbst.** Punkte, Matches, Statistiken und die Einstellungen des Boards bleiben bei Autodarts; die Erweiterung entscheidet nur, welche Konten am Display spielen.
- **Eine Wahl des Verschlüsselungsverfahrens.** Die Erweiterung wählt ihre Verfahren selbst, und ein Release ersetzt eines, das schwächer wird ([die Verfahren](security.md#algorithms)): Ein Display, das niemand einrichtet, sollte dafür keine Einstellung brauchen.
