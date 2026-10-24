---
hide:
  - navigation
  - toc
---

# Player Switch for Autodarts

![Player-Switch-Logo](images/icon.png){ width="96" align="right" }

**Ein gemeinsames Autodarts-Display, jeder im eigenen Konto, ein Tipp zum Wechseln.**

Das Display im Flur, im Verein oder in der Kneipe teilen sich alle, aber jede Person spielt unter ihrem eigenen Autodarts-Konto. Die Erweiterung behält die Anmeldung jedes gespeicherten Kontos auf diesem Computer und wechselt mit einem einzigen Tipp: kein Passwort, keine Anmeldeseite, und das Konto, das Platz macht, ist sofort wieder da, sobald es jemand antippt.

[:material-download: Installieren](https://github.com/Dennis-Otto/player-switch-for-autodarts#quick-start){ .md-button .md-button--primary } [:material-shield-check: Sicherheitsdesign](security.md){ .md-button } [:material-file-document-outline: Datenschutz](privacy.md){ .md-button }

![Das Popup: eine Liste der Spieler, der aktive hervorgehoben, dazu eine Kachel zum Hinzufügen eines Kontos; daneben die Verwalten-Ansicht eines Kontos mit den Optionen, das Passwort zu merken oder das Konto zu entfernen](images/popup.png)

## Das kann die Erweiterung

<div class="grid cards" markdown>

- :material-gesture-tap:{ .lg .middle } **Ein Tipp, nichts tippen**

    ---

    Jedes Konto einmal speichern. Ein Tipp auf eine Kachel bringt das Konto aufs Board.

- :material-account-switch:{ .lg .middle } **Niemand wird abgemeldet**

    ---

    Das Konto, das Platz macht, bleibt geparkt angemeldet und kommt mit einem Tipp zurück.

- :material-autorenew:{ .lg .middle } **Auch Tage später bereit**

    ---

    Autodarts wechselt seine Sitzungs-Token regelmäßig; die Erweiterung erneuert jedes geparkte Konto im Hintergrund.

- :material-lock-outline:{ .lg .middle } **Privat von Grund auf**

    ---

    Alles bleibt im Browser auf diesem Computer und geht nur an Autodarts. Keine Statistiken, kein eigener Server.

</div>

## So funktioniert es

Autodarts Play speichert die Anmeldung als einen einzigen Wert im Browser, einen rotierenden Refresh-Token. Die Erweiterung behält diesen Wert pro Konto und tauscht ihn beim Wechsel:

- **Beim Wechseln** parkt sie die Sitzung des Kontos, das gerade spielte, schreibt die Sitzung des gewählten Kontos in die Seite und lädt neu.
- **Das Konto, das Platz macht, wird bei Autodarts nicht abgemeldet.** Seine Sitzung bleibt gültig; der Wechsel nimmt es nur von der Seite.
- **Geparkte Sitzungen werden frisch gehalten**, weil der Token rotiert: alle 12 Stunden, und gleich nach dem Start des Browsers, wenn der Computer aus war, als eine Erneuerung fällig war. „Konten verwalten“ zeigt bei jedem geparkten Konto, wann es zuletzt erneuert wurde, etwa „Erneuert vor 3 Stunden“.
- **Du siehst, wer sich kümmern muss.** Muss sich ein Konto neu anmelden, zeigt das Symbol in der Symbolleiste, wie viele es sind, und sein Tooltip nennt sie.
- **Eine Änderung nach der anderen.** Ein Token gilt nur einmal, deshalb zählt ein zweiter Tipp nicht, solange ein Wechsel läuft, und die Erneuerung im Hintergrund wartet, bis der Wechsel fertig ist. Ein Doppeltipp meldet den vorigen Spieler nicht ab.
- **Passwort-Rückfall, optional.** Wenn du die Erweiterung ein Passwort merken lässt, meldet sie das Konto von selbst neu an, falls sein Token einmal nicht mehr geht. Konten, die sich mit Google oder Apple anmelden, können das nicht nutzen.

[Entscheidung 0002](decisions/0002-swap-the-session-not-the-login.md) hält fest, warum es so gebaut ist, und das [Sicherheitsdesign](security.md), was gespeichert wird und welche Risiken bleiben.

## Gut zu wissen

- Die Art, wie die Erweiterung eine Sitzung behält, ist keine offizielle Autodarts-Schnittstelle. Eine Änderung auf Seiten von Autodarts kann sie stoppen, bis die Erweiterung angepasst ist. Weist Autodarts alle gespeicherten Konten auf einmal ab, sagt das Popup das und verlinkt die bekannten Probleme und Updates: Dann lohnt sich ein Blick nach einem Update der Erweiterung, bevor sich alle neu anmelden.
- Sie ist für ein Display gebaut, das sich die Menschen eines Haushalts, Vereins oder Lokals teilen und dem sie vertrauen: Wer an diesem Display steht, kann zu jedem gespeicherten Konto wechseln.

Nicht mit Autodarts verbunden.
