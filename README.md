# HabitGrid Pro

Habit Tracker als installierbare Progressive Web App. Heatmap-Matrix über zwölf Monate,
Ruhetage als Streak-Schutz, flexible Frequenzen, Notizen und Stimmung, vier Themes,
druckbare Matrix. Läuft vollständig im Browser, funktioniert offline, kostet einmalig 9,99 €
statt eines Abonnements.

## Schnellstart

```bash
npm install
```

```bash
npm run dev
```

Die App läuft dann auf `http://localhost:5173`.

| Befehl                 | Zweck                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run dev`          | Entwicklungsserver mit Hot Reload                                     |
| `npm run build`        | Icons + Typprüfung + Produktionsbuild nach `dist/`                    |
| `npm run preview`      | Produktionsbuild lokal ausliefern (**hier** funktionieren PWA und SW) |
| `npm run check`        | Unit-Tests der Habit-Engine (25 Tests)                                |
| `npm run icons`        | PWA-Icons neu erzeugen                                                |
| `npm run genkey 5`     | Fünf Lizenzschlüssel erzeugen                                         |
| `npm run build:single` | Alles in eine einzelne HTML-Datei bündeln (nur Vorschau, ohne PWA)    |

Der Service Worker ist im Entwicklungsmodus abgeschaltet. Offline-Verhalten,
Installierbarkeit und Caching prüfst du mit `npm run build && npm run preview`.

## Umgebungsvariablen

`.env.example` nach `.env` kopieren und ausfüllen. **Alles mit `VITE_`-Präfix landet im
Client-Bundle** — dort gehören ausschließlich öffentliche Werte hinein.

| Variable                   | Wirkung, wenn gesetzt                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| `VITE_STRIPE_PAYMENT_LINK` | Kaufknopf leitet zu Stripe weiter. Fehlt er, erscheint ein Konfigurationshinweis. |
| `VITE_SUPABASE_URL`        | Zusammen mit dem anon key: Konten laufen über Supabase statt lokal.          |
| `VITE_SUPABASE_ANON_KEY`   | Öffentlicher Schlüssel. Der `service_role` key gehört **niemals** hierher.   |
| `VITE_SITE_URL`            | Basis für Canonical-Tags, OpenGraph-URLs und Structured Data.                |
| `VITE_CONTACT_EMAIL`       | Kontaktadresse in Impressum, Datenschutz und Widerrufsbelehrung.             |
| `VITE_ANALYTICS_ID`        | Blendet den Cookie-Consent-Banner ein. **Leer lassen, wenn du kein Analysewerkzeug einbindest** — ein Banner ohne einwilligungspflichtige Dienste ist überflüssig und kostet Conversion. |
| `STRIPE_SECRET_KEY`        | Nur serverseitig für `api/stripe-webhook.ts`. Ohne `VITE_`-Präfix.           |
| `STRIPE_WEBHOOK_SECRET`    | Nur serverseitig, für die Signaturprüfung des Webhooks.                      |

## Authentifizierung

Zwei Betriebsarten hinter einer Schnittstelle (`src/auth/providers.ts`):

- **Ohne Supabase-Variablen** laufen Konten lokal im Browser. E-Mail, Name und ein gesalzener
  SHA-256-Hash des Passworts liegen im localStorage. Die App ist sofort ohne Backend nutzbar —
  passend zum Offline-Versprechen, aber keine Sicherheitsgrenze und nicht gerätübergreifend.
- **Mit Supabase-Variablen** übernimmt Supabase Registrierung, Login und Passwort-Reset. Die
  Anbindung läuft direkt gegen die REST-Auth-API (`/auth/v1/signup`, `/token`, `/user`,
  `/recover`) — das spart die 100-kB-Abhängigkeit `@supabase/supabase-js`.

Supabase einrichten: Projekt anlegen → *Project Settings → API* → `URL` und `anon public`
in die `.env` eintragen. Unter *Authentication → Providers → Email* die Bestätigungsmail
konfigurieren; unter *URL Configuration* als Redirect `https://deine-domain.de/#/login` setzen.

## Stripe einrichten

Bewusst ein **Payment Link** statt einer Checkout-Session: kein Backend, keine laufenden Kosten.

1. Stripe Dashboard → **Produktkatalog** → Produkt „HabitGrid Pro", Einmalpreis 9,99 € inkl. USt.
2. **Zahlungslinks** → Link erstellen → Produkt auswählen.
3. *Nach der Zahlung* → **Auf eine Seite weiterleiten**: `https://deine-domain.de/#/success`.
4. *Nach der Zahlung* → Bestätigungsmail aktivieren und den Lizenzschlüssel eintragen
   (`npm run genkey`).
5. Link kopieren → `VITE_STRIPE_PAYMENT_LINK` in `.env`.
6. Stripe Tax aktivieren, wenn du an Verbraucher in mehreren EU-Ländern verkaufst (OSS beachten).

Für automatischen Versand: `api/stripe-webhook.ts` ausbauen und als Serverless Function
deployen. Die Datei enthält den vollständigen Ablauf inklusive Signaturprüfung als Kommentar.

## Erinnerungen (Push-Notifications)

Pro Habit lässt sich eine Uhrzeit hinterlegen. Die Seite berechnet, was heute fällig ist, und
übergibt die Liste an den Service Worker (`public/reminders-sw.js`); der entscheidet allein,
ob eine Meldung erscheint — so gibt es genau eine Stelle, die Doppelmeldungen verhindert.

**Was zuverlässig funktioniert und was nicht.** Es gibt keine browserübergreifende
Schnittstelle, um eine lokale Benachrichtigung für eine feste Uhrzeit vorzumerken.
`Notification.showTrigger` war ein Chrome-Experiment und wurde wieder entfernt. Real ist:

| Situation | Verhalten |
| --- | --- |
| App geöffnet | Meldung kommt auf die Minute. |
| App geschlossen, Chrome/Edge, PWA installiert | `periodicsync` weckt die Prüfung. Den Zeitpunkt bestimmt der Browser — die Meldung kann verspätet kommen. |
| App geschlossen, sonstige Browser | Keine Meldung. Die offenen Habits stehen beim nächsten Öffnen im Tagesplan. |
| iOS | Nur nach Installation auf dem Home-Bildschirm (ab iOS 16.4). Die Oberfläche führt Schritt für Schritt hindurch. |

Die App sagt dem Nutzer genau das, statt Zuverlässigkeit zu versprechen, die der Browser nicht
halten kann. Punktgenaue Zustellung bei geschlossener App bräuchte echtes Web Push mit
VAPID-Schlüsseln und einem sendenden Server — der `push`-Handler dafür ist vorbereitet, aber
nicht aktiv, weil das laufende Kosten bedeuten würde.

**Deep Links.** Ein Klick auf die Meldung öffnet `/#/app?habit=<id>`; das Dashboard öffnet
direkt die Tagesansicht des Habits. Über die Aktion „Erledigt" in der Benachrichtigung wird der
Tag ohne Umweg abgehakt: Der Worker kann den localStorage der Seite nicht schreiben, hinterlegt
die Absicht deshalb in IndexedDB, und die App wendet sie beim nächsten Öffnen an.

## Streak-Kristall

Das Dashboard zeigt ein 3D-Objekt, das mit der besten laufenden Serie wächst:

| Serie | Darstellung |
| --- | --- |
| 0–3 Tage | Matte Oberfläche, grobe Geometrie, langsame Drehung |
| 4–14 Tage | Eigenleuchten, Drahtgitter, umlaufende Partikel |
| 15+ Tage | Glaskristall mit Lichtbrechung, feinere Geometrie, leuchtender Innenkörper |

Die Farbwelt kommt aus der Kategorie des Habits mit der längsten Serie (Fitness rot, Mental
grün-gold, Wasser blau, Lernen violett). Ziehen dreht das Objekt, nach dem Loslassen läuft es
mit Trägheit aus.

## Gutscheincodes

Der Code `high_low21` schaltet die Vollversion ohne Zahlung frei (Groß-/Kleinschreibung egal).
Eingelöst wird im Bestelldialog; der Preis fällt sichtbar auf 0,00 € und der Bestellknopf wird
zu „Jetzt kostenlos freischalten". Freigeschaltet wird erst mit diesem Knopf, nicht schon beim
Einlösen — sonst verschwindet die Paywall mitsamt Dialog aus dem Baum.

> **Wichtig:** Der Code steht im Client-Bundle und ist damit für jeden lesbar, der die
> JavaScript-Datei öffnet. Das ist für einen Aktionscode vertretbar, aber kein Geheimnis.
> Soll ein Code wirklich begrenzt sein, gehört die Prüfung auf einen Server — praktisch über
> Stripe-Gutscheine im Payment Link statt über diesen Weg.

Code ändern: `COUPON_CODE` in `src/lib/pro.ts`.

## Installation auf Android — und die Play-Protect-Warnung

**Über Chrome installieren.** Menü ⋮ → „App installieren". Chrome lässt die WebAPK von
Google bauen und signieren; Play Protect beanstandet sie nicht.

Andere Browser gehen andere Wege. Samsung Internet und einige Drittanbieter erzeugen
eigene Pakete, die als Installation aus unbekannter Quelle gelten — daher die Meldung
„für eine ältere Android-Version entwickelt". **Das Web App Manifest kann daran nichts
ändern**, es kennt kein Feld für `targetSdkVersion`. Diese Angabe steckt ausschließlich in
einer APK.

### Echte APK bauen (optional)

Wer die App außerhalb des Browsers verteilen will, baut eine Trusted Web Activity. Die
Konfiguration liegt in `twa-manifest.json` mit `targetSdkVersion 34` — dem Wert, der die
Warnung beseitigt.

```bash
npm i -g @bubblewrap/cli && bubblewrap init --manifest https://jannis46.github.io/habitgrid-pro-v2/manifest.webmanifest
```

```bash
bubblewrap build
```

Zwei Dinge danach nicht vergessen:

1. Den beim ersten Bauen erzeugten Signaturschlüssel sichern. Geht er verloren, lässt sich
   die App nie wieder aktualisieren — auch nicht mit einem neuen Schlüssel.
2. Den SHA-256-Fingerabdruck in `public/.well-known/assetlinks.json` eintragen, sonst
   startet die App mit sichtbarer Adressleiste statt im Vollbild:

```bash
keytool -list -v -keystore android.keystore -alias android
```

## Deployment

Der Build ist statisch und läuft auf jedem Static Host.

```bash
npm run build
```

**Vercel** — Framework „Vite", Build `npm run build`, Output `dist`. Umgebungsvariablen unter
*Settings → Environment Variables*.
**Netlify** — Build `npm run build`, Publish `dist`. Für `api/stripe-webhook.ts` die Datei nach
`netlify/functions/` verschieben.
**Cloudflare Pages / GitHub Pages** — Inhalt von `dist/` ausliefern, sonst nichts.

Drei Dinge, die nach dem Deployment stimmen müssen:

- HTTPS ist Pflicht. Ohne sicheren Kontext gibt es weder Service Worker noch Installation.
- `sw.js` darf **nicht** dauerhaft gecacht werden (`Cache-Control: no-cache`), sonst bekommen
  Nutzer Aktualisierungen nie zu sehen. Vercel und Netlify machen das von selbst richtig.
- Domain in `public/robots.txt`, `public/sitemap.xml` und `VITE_SITE_URL` ersetzen.

## Vor dem Livegang zwingend erledigen

- [ ] Alle `[PLATZHALTER]` in `src/pages/Legal.tsx` ersetzen (Anbieterdaten, Hoster, Aufsichtsbehörde, Datum).
- [ ] Bei Kleinunternehmerregelung: Hinweis nach § 19 UStG in Impressum und AGB aktivieren.
- [ ] `[NAME / FIRMA]` im Footer (`src/components/Landing.tsx`) ersetzen.
- [ ] Abschnitt „Stimmen" mit **echten, nachweisbaren** Zitaten füllen oder löschen —
      erfundene Bewertungen verstoßen gegen § 5b Abs. 3 UWG i. V. m. Anhang Nr. 23b.
- [ ] Domain in `robots.txt`, `sitemap.xml`, `VITE_SITE_URL` und `index.html` (Canonical, OG-Bild) setzen.
- [ ] Rechtstexte anwaltlich prüfen lassen. Die Vorlagen sind sorgfältig gebaut, ersetzen aber keine Rechtsberatung.
- [ ] Auftragsverarbeitungsvertrag nach Art. 28 DSGVO mit Hoster und ggf. Supabase abschließen.
- [ ] `VITE_ANALYTICS_ID` leeren, falls du kein Analysewerkzeug einbindest.

## Rechtliche Umsetzung im Code

| Anforderung                                                     | Ort                                        |
| --------------------------------------------------------------- | ------------------------------------------ |
| Impressumspflicht (§ 5 DDG, § 18 MStV)                          | `src/pages/Legal.tsx` → `Impressum`        |
| Datenschutzerklärung inkl. Auth, Stripe, Service Worker (Art. 13)| `src/pages/Legal.tsx` → `Datenschutz`      |
| AGB inkl. Widerrufsverzicht (§ 356 Abs. 5 BGB)                  | `src/pages/Legal.tsx` → `AGB`, § 6         |
| Widerrufsbelehrung + Musterformular                             | `src/pages/Legal.tsx` → `Widerruf`         |
| Granulares Opt-in, Ablehnen so prominent wie Annehmen (§ 25 TDDDG)| `src/components/CookieConsent.tsx`       |
| Merkmale + Gesamtpreis über dem Bestellbutton (§ 312j Abs. 2)   | `src/components/Checkout.tsx`              |
| Buttonbeschriftung „Zahlungspflichtig bestellen" (§ 312j Abs. 3)| `src/components/Checkout.tsx`              |
| Gesonderte Zustimmung zum Widerrufsverzicht                     | `src/components/Checkout.tsx`              |
| Widerruf der Einwilligung jederzeit möglich                     | `RevokeConsentButton` in der Datenschutzseite |

## Aufbau

```
public/
  favicon.svg, robots.txt, sitemap.xml   statische SEO- und Icon-Dateien
  icons/                                 aus scripts/gen-icons.mjs erzeugt
src/
  engine/
    dates.ts        Lokale Kalendertage, ISO-Wochen (kein UTC — vermeidet Off-by-one)
    habits.ts       Frequenzen, Streaks mit Ruhetagen, Kennzahlen, Heatmap-Daten
    habits.test.ts  25 Unit-Tests
  auth/
    providers.ts    AuthProvider-Schnittstelle, lokale und Supabase-Umsetzung
    AuthContext.tsx React-Kontext, Sitzungsprüfung, Fehlermeldungen
  lib/
    store.tsx       Habits + Log, localStorage je Konto, Export/Import
    pro.ts          Lizenzschlüssel prüfen und einlösen
    seo.ts          Meta-Tags, Canonical, JSON-LD (SoftwareApplication, Product, FAQPage)
    theme.ts        Vier Themes über data-theme
  components/
    Landing.tsx     Verkaufsseite: Hero, Problem/Lösung, Features, Vergleich, Preise, FAQ
    Hero3D.tsx      Three.js-Glasmatrix (nachgeladen)
    Dashboard.tsx   Tages-Check-in, Habit-Karten, Statistiken, Sicherung
    Heatmap.tsx     Matrix über 53 Wochen
    HabitForm.tsx   Anlegen und Bearbeiten
    Checkout.tsx    Bestelldialog mit den rechtlich nötigen Bestätigungen
    CookieConsent.tsx, InstallPrompt.tsx
  pages/
    Auth.tsx        Login, Registrierung, Passwort zurücksetzen
    Legal.tsx       Impressum, Datenschutz, AGB, Widerruf
    Success.tsx     Danke-Seite mit Schlüsseleingabe
  App.tsx           Hash-Routing über sieben Routen, Zugriffsschutz für /app
api/stripe-webhook.ts   optionaler Ausbau für automatische Lizenzausgabe
scripts/
  gen-icons.mjs     PNG-Encoder ohne Bildbibliothek (node:zlib)
  genkey.mjs        Lizenzschlüssel-Generator
  build-single.mjs  Ein-Datei-Build für Vorschauzwecke
```

## Fachliche Entscheidungen

**Ruhetage als Wochenbudget.** Eine Serie darf einen geplanten Tag überspringen, solange das
Budget der betroffenen Kalenderwoche reicht; in der Matrix erscheint der Tag gelb statt grau.
Das ist der Unterschied zwischen einem Tracker, den man nach einer Erkältung löscht, und einem,
zu dem man zurückkommt.

**Lokale Kalendertage statt UTC.** Ein Check-in um 23:30 Uhr gehört zum heutigen Tag.
`toISOString()` würde ihn in vielen Zeitzonen dem Folgetag zuschlagen — der klassische
Off-by-one-Fehler in Habit-Trackern. Ein Test deckt das ab.

**Wochenziele zählen Wochen, keine Tage.** Bei „3× pro Woche" ist die Woche die Einheit der
Serie. Die laufende Woche kann die Serie nie abbrechen, solange sie noch läuft.

**Icons ohne Bildbibliothek.** `scripts/gen-icons.mjs` schreibt echte PNGs über `node:zlib`
statt sharp oder canvas als Abhängigkeit aufzunehmen — rund vierzig Zeilen für vier Dateien.

**Kein Router, kein Helmet.** Sieben statische Routen ohne Parameter und ein paar
Attributzuweisungen im `<head>` rechtfertigen keine zwei Abhängigkeiten.

## Performance

Gemessen mit einem Jahresdatensatz (8 Habits, 365 Tage, 2504 Einträge), Chromium auf Desktop:

| Vorgang | Zeit |
| --- | --- |
| Serie + 30-Tage-Quote für ein Habit | 1,03 ms |
| Heatmap über 53 Wochen für ein Habit | 0,37 ms |
| Kompletter Durchlauf über alle 8 Habits | 4,81 ms |
| `JSON.stringify` des gesamten Speicherstands | 0,22 ms |

Umgesetzte Maßnahmen:

- **`memo` auf Habit-Karte und Tageszeile, Einträge als eigene Prop.** Vorher liefen bei jedem
  Check-in die 4,81 ms für *alle* Karten; jetzt rechnet nur die geänderte Karte neu (1,4 ms).
  Der Unterschied wächst linear mit der Zahl der Habits — bei zwanzig wären es rund 12 ms
  gewesen, also der Großteil eines 16-ms-Frames.
- **Renderschleifen pausieren.** `Hero3D` und `StreakCrystal` laufen nur, wenn ihr Canvas im
  Sichtfeld liegt (`IntersectionObserver`) *und* der Tab aktiv ist (`visibilitychange`). Vorher
  lief der Hero auch weiter, wenn er längst weggescrollt war.
- **60-fps-Deckel** in beiden 3D-Komponenten. Auf 120-Hz-Displays war jeder zweite Frame
  verschenkte Akkuzeit.
- **Mobile Abstufung** (`innerWidth < 768`): Pixeldichte auf 1,5 statt 2, Kantenglättung aus,
  Hero-Raster von 98 auf 45 Kacheln, weniger Partikel, und keine Transmission — der teuerste
  Materialpfad in three.js, der auf Mittelklassegeräten der sichere Weg in eine ruckelnde
  Oberfläche ist.
- **Persistenz aus dem Klickpfad.** Der Speichervorgang läuft 120 ms verzögert; schnelle
  Klickfolgen werden zu einem Schreibvorgang zusammengefasst. Beim Tabwechsel wird sofort
  weggeschrieben, damit nichts verlorengeht.
- **Code-Splitting.** three.js liegt in einem eigenen Chunk (119 kB gzip) und wird weder für
  die Landingpage-Textinhalte noch für den Tages-Check-in geladen. Hero und Kristall kommen
  über `React.lazy`.

Bundle nach `npm run build`: 92 kB gzip Startbundle, three.js 119 kB gzip nachgeladen,
CSS 6 kB gzip.

## Bekannte Grenzen

Bewusste Vereinfachungen sind im Code mit `ponytail:` markiert:

- **Lizenzprüfung läuft im Client** und ist umgehbar. Serverseitige Prüfung bräuchte einen
  dauerhaft laufenden Endpoint und würde das Offline-Versprechen brechen.
- **Lokale Konten sind keine Sicherheitsgrenze.** Wer Zugriff auf das Gerät hat, hat Zugriff auf
  die Daten. Für echte Mehrgerätekonten Supabase konfigurieren.
- **Zustimmung zum Widerrufsverzicht wird lokal protokolliert.** Für einen belastbaren Nachweis
  gehört sie serverseitig zur Bestellung.
- **Push-Erinnerungen sind vorbereitet, aber nicht aktiv.** Manifest und Service Worker sind da;
  echte Push-Nachrichten brauchen VAPID-Schlüssel und einen Server, der sie versendet.
