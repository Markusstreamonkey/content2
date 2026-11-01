# Airplay Monitor

Live-Airplay-Charts aus dem aireal Ad Fingerprinting (ICY-Titelangaben der überwachten Radiostreams).

- Veröffentlicht als Claude-Artifact: https://claude.ai/artifact/T6BECLoRYNmmSRDcts5tan
- Gestaltung nach dem MAS Partners Design System (Inter, Limette als einziger Akzent, Leinen-Neutral, Radius 0, dunkle Kopfleiste mit Wortmarke).
- Datenzugriff live über den claude.ai-Connector „aireal Live Platform MCP“ (Name per Connector-Liste bestätigt) (Tools `ad-fingerprinting_song_airplay`, `_search_songs`, `_get_stream_timeline`, `_list_streams`, `_list_stream_groups`).

## Funktionen (Stufe 1: Songanalyse)
- Zeitraum 24 h oder 7 Tage, alle Sender oder bis zu 5 ausgewählte Sender (inkl. Schnellauswahl der Regionen-Kombis).
- Top 20 Songs und Top 20 Interpreten mit Anzahl Plays und Anzahl Sender.
- Drill-down: Song → Plays im Zeitverlauf, Plays je Sender, Katalogdaten (Jahr, BPM, Tonart, ISRC, Genres, Spotify, Audio-Features); Interpret → Titel und Sender; Sender → eigene Top 20 und Verlauf.

## Zählweise
- `song_airplay` liefert bei breiten Abfragen höchstens 200 (Titel × Sender)-Zeilen. „Alle Sender“ sammelt deshalb Kandidaten aus mehreren Teilabfragen und dem Musikkatalog und zählt jeden Kandidaten einzeln exakt nach. Zweiter Durchlauf: Alle Titel (Airplay + Katalog) jedes Interpreten, der mindestens so viele Plays hat wie der 20. Song, werden ebenfalls exakt gezählt (ein Song hat nie mehr Plays als sein Interpret); Interpreten-Listen unter der 200-Zeilen-Grenze sind bereits exakt und werden direkt übernommen. Breit, aber selten gespielte Titel und Interpreten kommen als Kandidaten aus dem Musikkatalog (Anzahl bestätigender Sender).
- Der aireal-Server antwortet auf Abfrage-Spitzen mit HTTP 429. Die Seite stellt höchstens 2 Abfragen gleichzeitig und wiederholt gebremste oder vorübergehend fehlgeschlagene Lesezugriffe mit wachsender Pause (bis zu 5 Wiederholungen). Ein Lauf „Alle Sender“ braucht damit rund 400 Abfragen bzw. zwei bis drei Minuten; Ergebnisse werden 15 Minuten zwischengespeichert.
- Senderauswahl zählt exakt aus `get_stream_timeline` (Musikblöcke; Wiederholungen desselben Titels nur durch einen Wortbeitrag unter 75 s getrennt = 1 Play; ein angekündigter, von Wort/Werbung vollständig überdeckter Titel („uncertain“-Block mit neuem Titel) zählt wie in `song_airplay`; Plays zählen im Fenster, in dem sie beginnen).
- Für exakte Fleet-Charts ohne Kandidatenverfahren bräuchte der Service einen Top-N-Endpunkt (z. B. `song_airplay` ohne Filter mit `limit`).

## Test
`node airplay-monitor/test/test.js` startet Chromium (Playwright) mit einem nachgebauten Connector (`test/mock.js`, Testdaten in der echten Antwortform inkl. 200-Zeilen-Kappung) und prüft Charts, Drill-down und Senderauswahl gegen die Testdaten.

`node airplay-monitor/test/realtest.js <timeline.json>` spielt einen echten `get_stream_timeline`-Abruf (24 h, ein Sender) durch die Seite. Abgleich am 01.11.2026 für Nova 96.9 (31.10. 20:00 – 01.11. 20:00 UTC) gegen `song_airplay`: Bed on Fire 10/10, Stop The Wedding! 8/8, Babydoll 8/8, Patient Zero 8/8, Great Expectation 7/7, Housewife 7/7.

`REAL_DIR=<ordner> node airplay-monitor/test/realfleet.js` prüft „Alle Sender“ gegen echte Daten: Der Ordner enthält `streams.json` und je Sender `tl_<id>.json` (echte `get_stream_timeline`-Antworten). Das Skript zählt daraus die exakten Top 20 und lässt die Seite gegen eine Nachbildung von `song_airplay` (inkl. 200-Zeilen-Kappung) laufen. Ergebnis am 01.11.2026 mit allen 160 Sendern (31.10. 20:00 – 01.11. 20:00 UTC, 49.530 Plays): Top 20 Songs und Top 20 Interpreten exakt. `RATELIMIT=1 node test/test.js` weist 30 % der Abfragen mit 429 ab und prüft, dass die Seite trotzdem korrekte Charts liefert.

## Laufprotokoll
Jeder Chart-Lauf legt in der Datenbank des Artifacts (`runs`) einen Eintrag an: Zeitfenster, Modus, Dauer, Anzahl Abfragen, Wiederholungen nach 429, endgültig fehlgeschlagene Abfragen, Fehlercode und Top 20. Damit lässt sich der Live-Betrieb nachträglich prüfen.
