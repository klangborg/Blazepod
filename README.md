# Blazepod

Dansk, offline-first PWA til at programmere og køre Blazepod-øvelser direkte fra telefonen. Ingen officiel app, ingen konto og intet abonnement. Øvelser, pod-navne og historik gemmes lokalt i IndexedDB.

## Krav

- **iPhone:** Safari har **ikke** Web Bluetooth. Brug [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) (gratis). Hvis Bluefy ikke kan levere manufacturer data (`watchAdvertisements`) eller tap-events på din konkrete iPhone/pod, prøv **Beacio** eller **C. Browser**.
- **Computer (udvikling):** Chrome eller Edge.
- Appen **skal** serveres over **HTTPS** (localhost tæller som sikker kontekst).
- Luk den **officielle Blazepod-app** før du tilslutter. Pods accepterer typisk kun én klient.

Auth er applikationsniveau (ikke BLE-pairing). Appen henter **friske** reklamedata **før** GATT-connect og skriver aldrig til Nordic DFU.

## Kør lokalt

```bash
npm install
npm run dev
```

- `npm run dev` — udviklingsserver (HTTP, virker på localhost).
- `npm run dev:https` — HTTPS via selvsigneret certifikat til test fra telefon på LAN. iPhone skal stole på certifikatet, ellers brug en hosted HTTPS-URL i stedet.
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run preview` — vis produktionsbuild.

Åbn siden i Chrome/Edge på computeren, eller i Bluefy på iPhone via HTTPS-adressen.

## Hosting

Appen er deployed på GitHub Pages:

**https://klangborg.github.io/Blazepod/**

Åbn den URL i Bluefy på iPhone (ikke Safari). Push til `main` bygger og udgiver automatisk.

Byg selv med `npm run build` og læg `dist/` på en anden HTTPS-tjeneste, hvis du vil. Hash-router (`#/…`) virker uden SPA-redirect.

Efter første indlæsning cacher PWA’en appen, så øvelser og historik virker offline.

## Brug

1. Luk den officielle Blazepod-app.
2. Åbn denne webapp i Bluefy (iPhone) eller Chrome/Edge (computer).
3. **Diagnostik:** tilslut én pod, tjek manufacturer data og auth-token, vent ca. 12 sekunder, tænd en dæmpet farve, og tryk på poden.
4. **Pods:** tilslut flere pods (ét brugertryk pr. pod), navngiv dem, og brug Identificér.
5. **Øvelser:** rediger eller start en øvelse. Stop/sluk er altid synlig under en session.
6. **Historik:** se hits, miss, bedste/gns. reaktion og runder.

Reaktionstider bruger poddens egne millisekunder (bytes 1–4 i tap-notifikationen), når de er gyldige. Ellers bruges klientens ur.

Hvis browseren mangler `watchAdvertisements` eller manufacturer data, vises en tydelig dansk fejl. Auth springes **aldrig** over.

Simuleret BLE (uden hardware) kan slås til under Diagnostik og bruges til udvikling/test.

## Manuel hardware-tjekliste

Denne repo verificerer protokol, UI og øvelsesmotor automatisk med en mock-adapter. Fysisk hardware skal du selv tjekke:

1. **Én pod**
   - Luk officiel app.
   - Bluefy over HTTPS.
   - Diagnostik: scan, se manufacturer data, auth-hold ~12 s, dæmpet farve tænd/sluk, ét tap-event.
2. **Flere pods**
   - Tilslut 2+ pods med hvert sit tryk.
   - Identificér (blink) den rigtige pod.
   - Navngivning huskes efter reload.
3. **Afbrydelse**
   - Sluk eller gå uden for rækkevidde midt i en øvelse.
   - Sessionen skal pause, og den aktuelle cue må **ikke** tælles som miss.
4. **Stop / sluk**
   - Stop og sluk alle lys med det samme, også hvis øvelsen kører.
5. **Fuld øvelse**
   - Kør en øvelse til ende (tid eller hits, gerne med runder).
   - Tjek historik: hits, miss, bedste/gns. reaktion, runder.

## Protokol (kort)

Offentligt reverse-engineeret, implementeret herfra — ingen kode er kopieret fra projekter uden licens.

- Company ID `0x09D7` (Coyotta)
- Auth: Nordic UART RX, payload `sea` + CRC32. Poly `0xEDB88321 + (offset % 50)`, wrap32 bagefter.
- Farve: `[G, B, R]`, valgfri 4. byte `0x01` auto-off ved tap. Sluk = `00 00 00`.
- Tap: 8-byte notify. Tilstande `00` / `21` / `25`.

## Arkitektur

- `src/ble/protocol.ts` — CRC, auth, GBR, tap
- `src/ble/WebBluetoothTransport.ts` / `MockBluetoothTransport.ts`
- `src/ble/PodManager.ts` — multi-pod, serielle GATT-skriv, nødsluk
- `src/domain/exercises.ts` + `src/engine/ExerciseRunner.ts`
- `src/storage/` — IndexedDB
- `src/pages/` — pods, diagnostik, editor, live session, historik
