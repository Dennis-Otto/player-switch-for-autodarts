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
  anmelden kann, wenn sein Token nicht mehr geht. Es wird versiegelt gespeichert,
  wie der Token (siehe unten), und geht nur an `api.autodarts.com/auth/v1/login`.
  Lass es aus, und kein Passwort wird je gespeichert.
- **Die Einstellungen des Knopfs in der Seite:** ob er zu sehen ist, und in welcher
  Ecke.
- **Die Einstellungen des Modus für Verein und Kneipe, sobald jemand ihn einschaltet:**
  ein gesalzener PBKDF2-Hash der Manager-PIN und der PIN jedes Spielers, nie eine PIN
  selbst, die Länge der Pause und das Hauskonto (siehe [den Modus für Verein und
  Kneipe](#venue-mode)). In `chrome.storage.session`, das der Browser beim Schließen
  leert: die Zahl der falschen PINs in Folge und die Zeit der letzten Eingabe auf der
  Autodarts-Seite, die nur sagt, dass es eine gab.
- **Wann die Erneuerung zuletzt lief,** und ob Autodarts dabei jedes geparkte Konto
  abgewiesen hat, damit die Erweiterung eine Erneuerung nachholt, die sie verpasst hat,
  während der Computer aus war, und ein Update von sich selbst vorschlagen kann. Das
  enthält keinen Token und keinen Namen.
- **Nur nach dem Wechsel zurück auf eine ältere Version: eine Kopie der gespeicherten
  Konten**, die eine neuere Version in einem Format gespeichert hat, das diese nicht
  lesen kann, unter `accounts.backup`, mit ihren Tokens und gemerkten Passwörtern,
  versiegelt, wie jene Version sie versiegelt hat. Diese Version speichert nie über
  solche Konten; die Kopie ist eine zweite Absicherung. Sie wird gelöscht, sobald
  wieder eine Version läuft, die die Konten liest, und mit der Erweiterung.
- **Der Schlüssel, der die Tokens und Passwörter versiegelt,** in der IndexedDB der
  Erweiterung (siehe unten).

### Versiegelte Tokens und Passwörter

`chrome.storage.local` enthält keinen Token und kein Passwort im Klartext. Der
Service Worker versiegelt jeden und jedes mit AES-GCM unter einem Schlüssel von
256 Bit (`src/vault.ts`) und speichert nur die zufällige Nonce und den
verschlüsselten Text, `{ iv, data }`. Die Namen, die Bilder und welches Konto spielt
bleiben lesbar, weil der Knopf in der Seite sie zeigt.

- **Der Schlüssel verlässt den Browser nie.** Der Service Worker erzeugt ihn einmal,
  mit WebCrypto, als Schlüssel, der sich nicht exportieren lässt, und behält ihn in
  der IndexedDB des eigenen Ursprungs der Erweiterung. Der Browser benutzt den
  Schlüssel für die Erweiterung, aber kein Skript sieht je seine Bytes, auch das der
  Erweiterung nicht. Weder ein Content Script noch eine Seite eines anderen Ursprungs
  kann diese Datenbank öffnen. Die Berechtigung `unlimitedStorage` hält Chrome davon
  ab, sie bei knappem Speicherplatz zu verdrängen, wie es das ohne sie mit dem
  Web-Speicher einer Erweiterung tun darf.
- **Jedes Geheimnis ist an seinen Platz gebunden.** Die ID des Kontos und das Feld,
  etwa `token/<id>`, sind die zusätzlichen Daten von AES-GCM. Ein versiegelter Token,
  der zu einem anderen Konto kopiert oder um ein einziges Bit verändert wurde, lässt
  sich nicht mehr öffnen.
- **Geht der Schlüssel verloren, kostet das eine Anmeldung, mehr nicht.** Ohne den
  Schlüssel, etwa nachdem die Daten der Erweiterung gelöscht wurden, lässt sich ein
  versiegelter Token oder ein Passwort nicht mehr öffnen. Die Konten müssen sich dann
  neu anmelden, ihre Passwörter sind vergessen, und nichts schlägt fehl. Lässt sich
  der Schlüsselspeicher für einen Moment nicht lesen, schlägt dagegen die Anfrage
  fehl, damit ein vorübergehender Fehler nie eine Sitzung kostet.
- **Ein Update versiegelt, was im Klartext lag.** Die Versionen davor speicherten
  die Tokens und Passwörter im Klartext. Ein Update auf diese Version versiegelt sie,
  und ebenso das erste Lesen der Konten danach. Eine Version, die das versiegelte
  Format nicht kennt, speichert nie darüber (siehe die Kopie oben).
- **„Alle Konten vergessen“ löscht den Schlüssel.** Nachdem es jede Sitzung bei
  Autodarts beendet hat, löscht der Service Worker die Konten, die Kopie einer
  neueren Version, den Schlüssel in der IndexedDB und den, den er im Speicher hält,
  dann alles Übrige in `chrome.storage.local` und `chrome.storage.session`. Eine
  Kopie des Speichers von vorher enthält versiegelten Text, der sich nirgends mehr
  öffnet, und das nächste Konto wird mit einem neuen Schlüssel versiegelt.

### Entfernen beendet die Sitzung bei Autodarts {#removing-ends-the-session}

Einen Token auf dem Computer zu löschen reicht nicht: Eine Kopie des Browserprofils,
etwa eine Sicherung, nimmt den Token und seinen Schlüssel mit, und Autodarts würde
diesen Token annehmen, bis er abläuft. Darum beendet **Konto entfernen** zuerst die
Sitzung bei Autodarts, mit der Abmeldung, die die Autodarts-Website schickt (`POST
/auth/v1/logout` mit dem Refresh-Token, `revokeSession` in `src/autodarts.ts`), und
löscht dann das Konto. Für das Konto, das gerade spielt, meldet sich zuerst die
Seite ab, und die Erweiterung beendet die Sitzung, die die Seite hatte; während
eines Matches fragt sie vorher, wie bei einem Wechsel. **Alle Konten vergessen** tut
dasselbe für jedes Konto, alle auf einmal, und löscht dann den Speicher und den
Schlüssel wie oben. Beides läuft in der Warteschlange des Service Workers, sodass
eine Erneuerung oder ein Doppeltipp nie einen Token schickt, den ein Entfernen
gerade beendet hat.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/removing-an-account.de.dark.svg">
  <img src="images/diagrams/removing-an-account.de.svg" alt="Wie ein Entfernen die Sitzung beendet: Konto entfernen und Alle Konten vergessen beenden die Sitzungen bei Autodarts, bevor die Erweiterung sie vergisst. Spielt ein gespeichertes Konto auf der Seite, meldet sich zuerst die Seite ab; während eines Matches fragt die Erweiterung, und ein Nein ändert nichts. Dann beendet die Erweiterung jede Sitzung, die sie behält, bei Autodarts, alle auf einmal, mit der Abmeldung, die die Autodarts-Website schickt, und vergisst die Konten; Alle Konten vergessen löscht auch alles Übrige, das sie behält, mit dem Schlüssel. Antwortet Autodarts, sagt das Popup, dass die Konten abgemeldet sind. Ist Autodarts nicht erreichbar, sind sie trotzdem vergessen, und das Popup sagt, dass ihre Sitzungen erst enden, wenn sie ablaufen.">
</picture>

Ist Autodarts nicht erreichbar, wird das Konto trotzdem gelöscht, das Popup sagt,
dass seine Sitzung weiterläuft, bis sie abläuft, und die Erweiterung behält keine
Kopie, um es später noch einmal zu versuchen. Eine Sitzung, die schon beendet war,
zählt als beendet.

Nur die Erweiterung selbst kann diesen Speicher lesen: ihr Service Worker und ihre
eigenen Seiten, das Popup, die Optionsseite und der Wechsler. Chrome lässt auch die
Content-Skripte einer Erweiterung `chrome.storage.local` lesen, wenn die Erweiterung
nichts anderes sagt, darum beschränkt der Service Worker ihn bei jedem seiner Starts
auf die eigenen Kontexte der Erweiterung (`TRUSTED_CONTEXTS`). `content.js`, das in
der Autodarts-Seite läuft, kann keinen Token und kein Passwort lesen, auch dann
nicht, wenn jemand den Prozess der Seite übernähme.

Die Erweiterung meldet nur über den eigenen Anmeldedienst von Autodarts an. Sie liest
nie einen Token oder ein Passwort von einer anderen Website, und der einzige Code, der
die gespeicherte Sitzung der Seite berührt, ist das Content-Skript, `src/content.ts`,
das der Build als `extension/lib/content.js` schreibt.

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
   kann den Speicher nicht lesen ([in Firefox](#firefox) schon). Der Service Worker nimmt eine Anfrage, die Konten zu
   sehen oder zu ändern, nur von einer Seite dieser Erweiterung an, nach der ID und der
   Adresse des Absenders, nicht vom Content-Skript, das nur fragen darf, was sein Knopf
   zeigt. Das Content-Skript nimmt seinerseits nur Anfragen dieser Erweiterung an und
   schreibt in die Sitzung der Seite nur einen Token.
4. **Das Manifest.** Die Erweiterung fragt nach den Berechtigungen `storage`,
   `alarms`, `scripting` und `unlimitedStorage` und nach Zugriff auf `play.autodarts.com` und
   `api.autodarts.com`, und nach nichts sonst. [`store/permissions.json`](https://github.com/Dennis-Otto/player-switch-for-autodarts/blob/main/store/permissions.json)
   nennt jede mit ihrem Grund, und `scripts/check-extension.mjs` lässt eine Änderung
   scheitern, die nach mehr fragt. `play.autodarts.io` leitet jede Adresse an
   `play.autodarts.com` weiter, darum zeigt sich nie eine Seite davon, und die
   Erweiterung fragt nach keinem Zugriff darauf.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/diagrams/who-reaches-the-accounts.de.dark.svg">
  <img src="images/diagrams/who-reaches-the-accounts.de.svg" alt="Wer an die gespeicherten Konten kommt: Die gespeicherten Konten liegen in chrome.storage.local, das nur die eigenen Kontexte der Erweiterung lesen können, der Service Worker und ihre Seiten: das Popup, die Optionsseite und der Wechsler in seinem Rahmen. Ihre Tokens und gemerkten Passwörter sind dort mit AES-GCM versiegelt; der Schlüssel lässt sich nicht exportieren und liegt in der IndexedDB der Erweiterung, die nur der Service Worker benutzt. content.js läuft in der Autodarts-Seite und kann den Speicher nicht lesen. Es darf den Service Worker nur fragen, was sein Knopf zeigt, nimmt Anfragen nur von dieser Erweiterung an und schreibt in die Sitzung der Seite nur einen Token. Der Service Worker nimmt eine Anfrage, die Konten zu sehen oder zu ändern, nur von einer Seite dieser Erweiterung an. Seine Content Security Policy lässt ihn nur mit api.autodarts.com verbinden, und der Browser sperrt jeden anderen Host.">
</picture>

### In Firefox {#firefox}

Firefox 140 und neuer führt dasselbe Paket aus ([Entscheidung 0012](decisions/0012-run-one-package-in-chrome-edge-and-firefox.md)),
mit einem Unterschied an der dritten Grenze: Firefox hat kein
`storage.local.setAccessLevel`, darum kann es `chrome.storage.local` nicht vor dem
Content-Skript verbergen. `content.js` liest weiterhin nichts daraus, und der Service
Worker nimmt von ihm weiterhin keine Anfrage an, die Konten zu sehen oder zu ändern.
Eine Autodarts-Seite, deren Prozess über eine Lücke des Browsers übernommen ist,
könnte den Speicher aber über das Content-Skript lesen und ändern:

- die Sitzungen und gemerkten Passwörter bleiben versiegelt, denn der Schlüssel liegt
  in der IndexedDB der Erweiterung, die das Content-Skript nicht erreicht;
- die Namen und Bilder der gespeicherten Konten, die Einstellungen und die gesalzenen
  Hashes der PINs des Modus für Verein und Kneipe sind in ihrer Reichweite, und eine
  Änderung daran auch, etwa den Modus auszuschalten.

Der Service Worker schreibt bei jedem Start in seine Konsole, dass er den Speicher
nicht beschränken kann. Für ein Display in einem Verein oder einer Kneipe nimm Chrome
oder Edge, die den Speicher vor der Seite verbergen. Bevor das Add-on auf
addons.mozilla.org gelistet wird, ziehen die Konten auch in Firefox in die IndexedDB
der Erweiterung um. Edge führt das Paket aus wie Chrome, mit demselben Schutz.

## Der Modus für Verein und Kneipe {#venue-mode}

Der Modus für Verein und Kneipe, der aus ist, bis jemand ihn unter **Einstellungen**
einschaltet, sperrt ein Display im Verein oder in der Kneipe gegen die Leute davor:
einen Gast, der unter dem Konto eines Stammspielers spielt und ihm die Statistik
verdirbt, jemanden, der Konten entfernt oder ein Passwort merkt, und das Konto eines
Spielers, der gegangen ist und für den sonst die nächsten Spiele zählen. Er ist eine
Sperre für die Leute am Display, kein Schutz vor jemandem, der den Computer benutzen
kann.

- **Keine PIN wird gespeichert.** Jede PIN, 4 bis 8 Ziffern, wird als Hash von PBKDF2
  mit SHA-256 gespeichert, mit 600.000 Runden, wie OWASP sie empfiehlt, und einem
  eigenen zufälligen Salz von 16 Bytes, gemacht mit WebCrypto. Eine Prüfung vergleicht
  die Hashes in einer Zeit, die nicht verrät, wie viele Bytes übereinstimmen.
- **Der Service Worker prüft jede PIN,** bei jedem Wechsel zu einem Konto mit PIN und
  bei jeder Änderung unter **Konten verwalten** oder auf der Seite der Einstellungen,
  so kommen weder das Popup noch der Umschalter auf der Autodarts-Seite daran vorbei.
  Das Content-Skript kann die Hashes weder lesen noch diese Anfragen senden.
- **Fünf falsche PINs in Folge sperren jede PIN für eine Minute.** Alle PINs des
  Displays teilen sich eine Zahl, und eine richtige PIN setzt sie nicht zurück: Die
  Folge endet erst, wenn eine Minute ohne falsche PIN vergeht. So kann ein Gast die
  Zahl zwischen zwei Versuchen nicht mit der richtigen PIN seines eigenen Kontos
  löschen. Die Zahl steht in `chrome.storage.session`, so übersteht sie einen Schlaf
  des Service Workers; ein Neustart des Browsers löscht sie.
- **Die Manager-PIN lebt so lange wie die Ansicht, die nach ihr gefragt hat:** Das
  Popup und der Umschalter vergessen sie, wenn **Konten verwalten** zugeht, die Seite
  der Einstellungen, wenn sie zugeht.
- **Die Rückkehr nach einer Pause** muss wissen, wann jemand die Autodarts-Seite
  zuletzt benutzt hat. Das Content-Skript sagt dem Service Worker nur, dass es eine
  Eingabe gab, nie wo oder welche, höchstens alle 15 Sekunden und nur, solange die
  Rückkehr an ist. Ein Match, das in einem Autodarts-Tab läuft, zählt als Eingabe, so
  beendet die Rückkehr nie eins, und der Spieler davor behält seine Sitzung geparkt.
- **Was er nicht verhindert:** Wer den Computer benutzen kann, kann die Erweiterung
  unter `chrome://extensions` entfernen, den Modus in der Konsole ihres Service
  Workers ausschalten (die [Anleitung](shared-display.md#forgotten-manager-pin) zeigt
  wie, für eine vergessene Manager-PIN) oder das Profil des Browsers kopieren und alle
  10.000 PINs mit 4 Ziffern in kurzer Zeit gegen einen Hash probieren. Längere PINs
  dauern länger, nicht ewig.

## Bedrohungen und Gegenmaßnahmen

| Bedrohung | Gegenmaßnahme |
| --- | --- |
| Ein Token geht an die falsche Stelle | Anfragen gehen nur an `api.autodarts.com`; die Liste der Hosts im Manifest ist auf Autodarts beschränkt, und die Content Security Policy lässt den Browser eine Anfrage an jeden anderen Host sperren |
| Eine Seite, deren Prozess jemand übernommen hat, liest die gespeicherten Tokens und Passwörter über das Content-Skript | Bei jedem seiner Starts beschränkt der Service Worker `chrome.storage.local` auf die eigenen Kontexte der Erweiterung, darum kann das Content-Skript ihn nicht lesen; es bekommt nur den Spieler auf dem Knopf |
| Das Content-Skript, oder eine Seite, die es übernommen hat, schickt eine Anfrage, die die Konten liest oder Spieler wechselt | Der Service Worker nimmt eine solche Anfrage nur von einer Seite dieser Erweiterung an, nach der ID und der Adresse des Absenders; das Content-Skript nimmt nur Anfragen dieser Erweiterung an |
| Ein Werkzeug, ein Abzug oder eine Kopie von `chrome.storage.local` (nicht des ganzen Profils) findet die Tokens und Passwörter; eine Kopie des ganzen Profils nimmt den Schlüssel mit, siehe das verbleibende Risiko | Jeder Token und jedes Passwort ist mit AES-GCM versiegelt, unter einem Schlüssel, der sich nicht exportieren lässt und in der IndexedDB der Erweiterung liegt, nicht in `chrome.storage.local`; der Speicher enthält nur den versiegelten Text |
| Wer den Speicher schreiben kann, verschiebt einen versiegelten Token zu einem anderen Konto oder verändert ihn | Jedes Geheimnis ist mit seinem Konto und seinem Feld als zusätzlichen Daten versiegelt, darum lässt sich ein verschobener oder veränderter Wert nicht öffnen, und das Konto muss sich neu anmelden |
| Ein entferntes Konto funktioniert bei Autodarts weiter, aus einer Sicherung oder einer Kopie des Profils | **Konto entfernen** beendet die Sitzung bei Autodarts, bevor die Erweiterung es löscht, für das Konto, das spielt, auch die auf der Seite; **Alle Konten vergessen** tut das für jedes Konto und löscht dann den Speicher und den Schlüssel. Ist Autodarts nicht erreichbar, sagt das Popup, dass die Sitzung weiterläuft, bis sie abläuft |
| Ein Display wechselt mit den Konten darauf den Besitzer | **Alle Konten vergessen**, hinter einer Rückfrage und im Modus für Verein und Kneipe hinter der Manager-PIN, beendet jede Sitzung und lässt die Erweiterung wie nach der Installation zurück |
| Der Schlüssel ist weg, etwa nachdem die Daten der Erweiterung gelöscht wurden (die Berechtigung `unlimitedStorage` hält Chrome davon ab, ihn von selbst zu verdrängen) | Die Konten, die sich nicht öffnen lassen, müssen sich neu anmelden, und ihre Passwörter sind vergessen; nichts schlägt fehl, und nichts wird stattdessen im Klartext gespeichert |
| Ein veralteter Token wird wieder benutzt und sperrt ein Konto aus | Die Erweiterung behält immer den Token, den der Server zuletzt zurückgab (Rotation), und erneuert geparkte Token im Hintergrund; jede Änderung der Konten läuft einzeln nacheinander in einer Warteschlange des Service Workers, darum schicken weder ein Doppeltipp noch die Erneuerung denselben Token zweimal |
| Ein Passwort wird gespeichert, obwohl das niemand wollte | Ein Passwort wird nur nach einem ausdrücklichen „Passwort merken“ behalten; das ist von Haus aus aus und lässt sich wieder vergessen |
| Eine Anmeldung am Display wird gespeichert, ohne dass jemand darum gebeten hat | Eine neue Sitzung wird nur in den zehn Minuten nach „Konto hinzufügen“ oder der Installation von selbst gespeichert, nur einmal und nur, solange kein gespeichertes Konto spielt; ein abgelaufenes Zeitfenster schließt sich für immer, und „Abbrechen“ im Popup oder im Wechsler schließt es früher. Jede andere Sitzung wartet auf „Konto speichern“ |
| Die Sitzung der Seite wird unerwartet angefasst | Nur `content.js` liest oder schreibt sie, nur unter dem Schlüssel `autodarts_refresh_token`, nur auf `play.autodarts.com`, und es schreibt nur einen Token, nie einen anderen Wert |
| Anderer Code als `content.js` läuft in der Autodarts-Seite, etwa wenn die Erweiterung ihr Skript nach einem Update oder in einem Tab, der nicht mehr antwortet, noch einmal ausführt | `chrome.scripting` führt nur die mitgelieferte Datei `content.js` aus, über ihren Namen, nie zur Laufzeit erzeugten Code, und nur im Hauptframe eines Tabs, den der Service Worker kurz davor über seine Adresse auf `play.autodarts.com` auswählt; `content.js` selbst tut auf jeder anderen Seite nichts, falls der Tab inzwischen weitergegangen ist. Eine Kopie, die ein Update abgeschnitten hat, erreicht weder die Erweiterung noch den Speicher, und die neue Kopie läuft einmal pro Seite, darum antwortet ein Tab, der sie zweimal bekommt, nur einmal |
| Nach einem stillen Update der Erweiterung antwortet die Seite nicht mehr, und ein Display zeigt „Autodarts öffnen“, bis jemand es neu lädt | Jede Installation und jedes Update führt das neue `content.js` in den offenen Autodarts-Tabs aus, und ein Tab, dessen Skript auf eine Anfrage nicht antwortet, bekommt es noch einmal, bevor die Erweiterung diesen Tab als letzten Ausweg neu lädt |
| Ein Wechsel landet in einem verborgenen Tab, oder ein anderer Autodarts-Tab spielt als das vorige Konto weiter und verbraucht dessen Token | Ein Wechsel geht an den Autodarts-Tab, der im zuletzt benutzten Fenster zu sehen ist, und jeder andere Autodarts-Tab lädt neu, sobald sich die Sitzung in der Seite geändert hat, darum behält kein Tab das vorige Konto im Speicher |
| Eine Seite, die gerade startet, erneuert ihre Sitzung, während die Erweiterung sie parkt | Antwortet kein Tab, öffnet die Erweiterung einen oder lädt einen neu und wartet, bis die Seite die Sitzung erneuert hat, mit der sie gestartet ist, darum parkt sie den frischen Token des vorigen Spielers und keinen verbrauchten. In jedem Fall liest sie den Token direkt, bevor sie ihn sendet, und ein Token, den Autodarts ablehnt, während die Seite schon einen neueren hält, zählt nicht: Sie fragt dann mit dem neueren |
| Jemand meldet sich direkt in der Seite als anderes Konto an, und ein Tipp speichert diese Sitzung unter der Kachel des vorigen Spielers, der dann unter falschem Namen spielt | Wem ein Token gehört, kann nur Autodarts sagen, darum erneuert ein Wechsel oder eine Abmeldung den Token der Seite einmal, wenn er die Seite verlässt, und parkt den frischen Token bei dem Konto, das Autodarts nennt. Der abgemeldete Spieler zeigt, dass er sich neu anmelden muss. Die Sitzung eines Kontos ohne Kachel wird nicht gespeichert, denn eine Anmeldung wird nur mit einem Tipp gespeichert. Ohne Antwort von Autodarts bleibt die Seite, wie sie ist |
| Die Erweiterung sieht mehr vom Browser, als sie braucht | Sie fragt nicht nach der Berechtigung `tabs`: Sie findet die Autodarts-Tabs über ihren Host-Zugriff und fragt nur nach ihnen, und der Browser gibt ihr Adresse und Titel keines anderen Tabs |
| Die Skripte der Autodarts-Seite lesen die gespeicherten Konten aus dem Wechsler | Der Wechsler ist eine Seite der Erweiterung in einem Rahmen eines anderen Ursprungs, in einem geschlossenen Shadow Root; das Content-Skript bekommt vom Service Worker nur den Spieler auf dem Knopf |
| Ein Wechsel während eines Matches beendet es unerwartet | Auf einer Match-Seite lehnt der Service Worker einen Wechsel oder eine Abmeldung ab, bis die Person bestätigt, bevor er einen Token verbraucht |
| Eine Änderung fügt eine Berechtigung oder einen Host hinzu, und nach dem Update schaltet Chrome die Erweiterung auf einem Kiosk-Display ab, bis jemand die neue Warnung annimmt | `scripts/check-extension.mjs` lässt `scripts/check.sh` scheitern, solange `store/permissions.json` die Berechtigung nicht mit ihrem Grund erlaubt und nicht beide Store-Einträge sie begründen. Es lehnt auch `externally_connectable` ab, optionale Berechtigungen, ein Content-Skript in der Welt der Seite und eine Content Security Policy, die Skripte von anderswo ausführt |
| Jemand, der an die Anmeldung beim Chrome Web Store gekommen ist, veröffentlicht ein eigenes Update für alle Nutzer | Die Jobs des Workflows, der ein Release ausliefert, erreichen nur die Hosts, die sie brauchen, und führen neben der Anmeldung kein npm-Paket aus. Sobald die Anmeldung ohne Geheimnis eingerichtet ist, melden sie sich ohne gespeichertes Geheimnis an: Google tauscht das OIDC-Token von GitHub gegen ein Zugriffstoken für 20 Minuten, und nur für einen Lauf von `publish-store.yml` auf `main` dieses Repositorys, sodass kein Geheimnis zum Stehlen bleibt ([Entscheidung 0010](decisions/0010-sign-in-to-the-store-without-a-stored-secret.md)). Google prüft jede Version, bevor sie die Nutzer erreicht |
| Ein kompromittiertes Paket oder ein kompromittierter Runner ändert, was in den Store kommt, irgendwo zwischen dem Tag und dem Upload | Der Store bekommt nur das Zip des Releases, das der isolierte Build aus dem signierten Tag baut und attestiert. Der Workflow des Stores baut nichts und führt kein npm-Paket aus: Er prüft die Herkunft und die Version. Derselbe Commit ergibt mit demselben Build von zlib dasselbe Zip, sodass jeder es aus dem Tag bauen und vergleichen kann ([Entscheidung 0013](decisions/0013-send-the-store-the-zip-that-the-release-attests.md)) |
| Ein älterer Browser installiert die Erweiterung und scheitert dann im Betrieb | Das Manifest verlangt Chrome 140 oder neuer (`minimum_chrome_version`), die erste Version, in der `chrome.storage.local.setAccessLevel` die Konten vor dem Content-Script verbirgt, und Firefox 140 oder neuer (`strict_min_version`), das erste, das bei der Installation die Daten zeigt, die das Add-on sendet; `scripts/check-extension.mjs` scheitert an einer niedrigeren |
| Jemand an einem Display im Verein oder in der Kneipe spielt unter dem Konto eines anderen | Im Modus für Verein und Kneipe kann ein Konto nach einer PIN fragen, die der Service Worker prüft, bevor er einen Token dieses Kontos verbraucht |
| Jemand am Display entfernt Konten oder merkt ein Passwort | Im Modus für Verein und Kneipe nimmt der Service Worker keine Änderung unter **Konten verwalten** und keine Änderung des Modus ohne die Manager-PIN an |
| Jemand am Display rät eine PIN von Hand | Fünf falsche PINs in Folge sperren jede PIN für eine Minute, gezählt im Service Worker, nicht im Popup |
| Eine PIN wird aus dem Speicher gelesen | Der Speicher hält einen gesalzenen PBKDF2-Hash mit 600.000 Runden, nie die PIN, und nur der Service Worker und die Seiten der Erweiterung können ihn lesen, [in Firefox](#firefox) auch das Content-Skript |
| Ein Spieler geht, und die nächsten Spiele zählen für sein Konto | Der Modus für Verein und Kneipe bringt das Display nach einer Pause ohne Eingabe zu einem Hauskonto zurück oder meldet es ab und parkt die Sitzung des Spielers; ein laufendes Match zählt als Eingabe und wird nie unterbrochen |

## Verbleibende Risiken

- Die Erweiterung unter `chrome://extensions` zu entfernen löscht alles, was sie
  gespeichert hat, aber Chrome führt beim Entfernen keinen Code der Erweiterung aus,
  also endet keine Sitzung bei Autodarts: Die geparkten Sitzungen laufen weiter, bis
  sie ablaufen, und der Spieler auf der Seite bleibt angemeldet. **Alle Konten
  vergessen** beendet sie vorher. Ein Entfernen, während Autodarts nicht erreichbar
  ist, lässt die Sitzung ebenfalls gültig, bis sie abläuft.
- Eine PIN des Modus für Verein und Kneipe ist eine Sperre für die Leute am Display.
  Wer den Computer benutzen kann, kann die Erweiterung entfernen oder den Modus
  ausschalten, und mit einer Kopie des Profils des Browsers kann ein Programm jede
  PIN mit 4 Ziffern in kurzer Zeit gegen ihren Hash probieren.
- Ein gespeicherter Token oder ein Passwort ist nur so gut geschützt wie der Computer
  und das Browserprofil, in dem er liegt; diese Erweiterung ist für einen vertrauten,
  gemeinsamen Rechner gedacht, nicht für einen öffentlichen. Das Versiegeln ist eine
  zusätzliche Schutzschicht, kein Passwortmanager: Wer das Browserprofil auf der
  Festplatte lesen kann, mit demselben Konto des Betriebssystems, kann auch den
  Schlüssel in der IndexedDB der Erweiterung lesen, und Code, der in der Erweiterung
  selbst läuft, könnte den Schlüssel einen Token öffnen lassen. Der Schlüssel hält
  die Werkzeuge, Sicherungen und Kopien des Profils auf, die nur den Speicher der
  Erweiterung lesen, und ein Content Script oder eine Seite eines anderen Ursprungs.
- Die Autodarts-Seite kann erkennen, dass die Erweiterung installiert ist, am Knopf
  und an `switcher.html`, das sie laden darf. Eine Seite, die es darauf anlegt, könnte
  den Wechsler auch unter einen Köder legen und einen Tipp darauf erschleichen; dazu
  bräuchte es ein Skript von Autodarts selbst, das die Sitzung des Spielers in der
  Seite ohnehin schon hat.
- Firefox kann den Speicher nicht auf die eigenen Kontexte der Erweiterung
  beschränken. Der Service Worker schreibt das bei jedem Start in seine Konsole,
  `content.js` liest weiterhin selbst nichts aus dem Speicher, und die Sitzungen und
  Passwörter darin bleiben versiegelt; [in Firefox](#firefox) sagt, was sonst in
  Reichweite ist.
- Ein Werkzeug, das nur die Prüfungen ausführen, kann ein Advisory ohne Behebung
  haben, etwa das deepmerge, das addons-linter festlegt. `osv-scanner.toml` akzeptiert
  es mit seinem Grund und bis zu einem Datum, an dem jemand es wieder prüft. Das Paket
  liefert keinen Code Dritter aus, und [ein Test](development.md#checks) zeigt, dass
  kein Manifest das Zusammenführen dieses Werkzeugs erreicht.
- Die Anmeldung von Autodarts ist keine veröffentlichte Schnittstelle. Eine Änderung
  auf ihrer Seite kann die Erweiterung stoppen, bis sie angepasst ist, und könnte
  ändern, wie lange ein geparkter Token gültig bleibt.

Maßgeblich ist die englische Fassung, die der Sprachumschalter oben zeigt.
