# Airplay Monitor

Live-Airplay-Charts aus dem aireal Ad Fingerprinting (ICY-Titelangaben der überwachten Radiostreams).

- Veröffentlicht als Claude-Artifact: https://claude.ai/artifact/T6BECLoRYNmmSRDcts5tan
- Datenzugriff live über den claude.ai-Connector „aireal Live Platform MCP“ (Tools `ad-fingerprinting_song_airplay`, `_search_songs`, `_get_stream_timeline`, `_list_streams`, `_list_stream_groups`).

## Funktionen (Stufe 1: Songanalyse)
- Zeitraum 24 h oder 7 Tage, alle Sender oder bis zu 5 ausgewählte Sender (inkl. Schnellauswahl der Regionen-Kombis).
- Top 20 Songs und Top 20 Interpreten mit Anzahl Plays und Anzahl Sender.
- Drill-down: Song → Plays im Zeitverlauf, Plays je Sender, Katalogdaten (Jahr, BPM, Tonart, ISRC, Genres, Spotify, Audio-Features); Interpret → Titel und Sender; Sender → eigene Top 20 und Verlauf.

## Zählweise
- `song_airplay` liefert bei breiten Abfragen höchstens 200 (Titel × Sender)-Zeilen. „Alle Sender“ sammelt deshalb Kandidaten aus mehreren Teilabfragen und dem Musikkatalog und zählt jeden Kandidaten einzeln exakt nach.
- Senderauswahl zählt exakt aus `get_stream_timeline` (Musikblöcke; Wiederholungen desselben Titels innerhalb von 8 Minuten = 1 Play).
- Für exakte Fleet-Charts ohne Kandidatenverfahren bräuchte der Service einen Top-N-Endpunkt (z. B. `song_airplay` ohne Filter mit `limit`).
