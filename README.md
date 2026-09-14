# مطبخنا

Eine mobile-first, arabische RTL-PWA für Familien: „Was kochen wir heute?“ wird mit einem gemeinsamen Gerichtekatalog, Wochenplan und synchroner Einkaufsliste beantwortet.

## Funktionen

- vollständige arabische Oberfläche mit `lang="ar"` und `dir="rtl"`
- Registrierung, Anmeldung, Passwort-Reset, persistente Session und Logout über Supabase Auth
- mehrere Haushalte, sicherer 16-stelliger Einladungscode und Rollen `owner`/`member`
- Gerichte und Zutaten: anlegen, bearbeiten, löschen (mit Bestätigung), Favoriten und Kategorien
- Übernahme der bestehenden arabischen Zutatenbereinigung
- Zufallsauswahl mit Favoriten-, Kategorie- und Ausschlussfilter sowie erneutem Würfeln
- gemeinsame, abhaktbare Einkaufsliste inklusive Teilen via Web Share API oder WhatsApp-Fallback
- Wochenplan Montag–Sonntag mit Zufallsvorschlag und deduplizierter Sammelliste
- Manifest, Service Worker, Safe-Area-Layout, große Touch-Ziele und Offline-App-Shell

## Architektur

`src/App.tsx` enthält die Bildschirm-Komposition; Fachlogik ist in `src/lib/ingredients.ts` und `src/lib/random.ts`, der Datenzugriff ausschließlich in `src/lib/api.ts`, die Konfiguration in `src/lib/supabase.ts`. Die App nutzt React, TypeScript, Vite, `@supabase/supabase-js` und `vite-plugin-pwa`.

Der vorherige Stand war eine einzige `index.html` mit einer öffentlich beschreibbaren Firebase-Realtime-Database. Die verwendbare Logik (Zutatenbereinigung, zufällige und manuelle Auswahl, WhatsApp-Text) wurde neu implementiert. Firebase-Daten werden nicht verändert oder gelöscht.

## Lokale Installation

```bash
cp .env.example .env
# VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY eintragen
pnpm install
pnpm dev
```

Es werden nur die öffentliche Projekt-URL und der Publishable Key an den Browser ausgeliefert. Niemals `service_role`-, Secret- oder Datenbank-Passwörter in `.env` mit `VITE_`-Präfix setzen.

## Supabase-Setup

1. Ein Supabase-Projekt anlegen oder auswählen.
2. Auth > URL Configuration: lokale URL, Preview-URL und Produktions-URL als Redirect URLs eintragen.
3. E-Mail/Passwort-Anmeldung aktivieren; die gewünschte E-Mail-Bestätigung konfigurieren.
4. Supabase CLI verknüpfen und die Migration ausführen:

```bash
supabase link --project-ref <REF>
supabase db push
supabase test db
```

Die Migration liegt in `supabase/migrations/202609140001_initial_schema.sql`. Sie erstellt `profiles`, `households`, `household_members`, `dishes`, `ingredients`, `shopping_lists`, `shopping_items` und `meal_plan`, FK-Beziehungen, Indizes, Constraints und `updated_at`-Trigger.

### Bestehende Firebase-Daten migrieren

Der Altdatenpfad ist `meals2/dishes` in `https://cook-book-6d572-default-rtdb.europe-west1.firebasedatabase.app`. Das Format lautet `{ id: { name, ingredients: string[] } }`.

1. Firebase-Daten read-only exportieren und sichern.
2. Für ein Zielkonto einen Haushalt anlegen.
3. Jeden Eintrag als `dishes`-Zeile mit der Ziel-`household_id` und `created_by` importieren; seine Zutaten als `ingredients` mit `position` importieren.
4. Erst nach validiertem Import die Benutzer auf die neue Anwendung umleiten. Die alte Firebase-Datenbank nicht löschen, bevor eine Sicherung und Stichproben vorliegen.

## RLS-Konzept

RLS ist auf jeder Public-Tabelle aktiviert; `anon` erhält keine Tabellenrechte. Private `security definer`-Hilfsfunktionen prüfen ausschließlich `auth.uid()` gegen `household_members` und verhindern dabei rekursive Policies. Haushaltsanlage und Beitritt passieren atomar über RPCs statt über offen beschreibbare Mitgliedschaftstabellen.

| Bereich | Zugriff |
| --- | --- |
| Profile | nur das eigene Profil |
| Haushalt / Mitglieder | ausschließlich Mitglieder; Änderung des Haushalts nur Owner |
| Gerichte / Zutaten | jedes Haushaltsmitglied des zugehörigen Haushalts |
| Einkaufslisten / Artikel | jedes Haushaltsmitglied des zugehörigen Haushalts |
| Wochenplan | jedes Haushaltsmitglied des zugehörigen Haushalts |

`supabase/tests/rls_contract.test.sql` dokumentiert die RLS-Grundprüfung. Ergänzend sollten im verbundenen Projekt zwei echte Testnutzer je Haushalt erzeugt werden: Zugriff auf die Daten des jeweils anderen Haushalts muss leer sein bzw. mit Policy-Fehler abbrechen.

## Tests und Qualität

```bash
pnpm lint
pnpm test
pnpm build
```

Enthalten sind Unit-Tests für Zutatenbereinigung/Deduplizierung und Zufallsauswahl. Die Migration enthält den Policy-Testvertrag. Nach dem Datenbank-Deploy sind End-to-End-Tests für Registrierung, Login/Logout, Haushaltserstellung/-beitritt, CRUD, Wochenplan und Haushaltstrennung auszuführen.

## Vercel

1. Repository als Vercel-Projekt importieren (Framework: Vite).
2. Für Preview und Production die beiden `VITE_SUPABASE_*`-Variablen setzen.
3. Preview erzeugen: `vercel deploy`; danach `vercel --prod`.
4. Die jeweilige URL in Supabase Auth als Redirect URL eintragen.

## PWA-Installation

Chrome/Android: Browser-Menü → „App installieren“. Safari/iPhone: Teilen → „Zum Home-Bildschirm“. Die App-Shell bleibt offline verfügbar; Schreibvorgänge benötigen eine Verbindung und zeigen bei Fehlern einen arabischen Hinweis.

## Security Review

- kein `innerHTML`, keine Service-Role-Keys und keine Secret-Variablen im Client
- React escaped Benutzereingaben standardmäßig; Formulare haben Längenlimits
- RLS, FK, immutable Ownership-Trigger und unvorhersagbare kryptografische Einladungscodes mindern IDOR/BOLA-Risiken
- Passwörter werden ausschließlich Supabase Auth übergeben
- alte Firebase-REST-URL wurde nicht übernommen

Bekannte Einschränkung: Für Echtzeit-Push im laufenden Browser muss in Supabase Realtime die Replikation für `shopping_lists` und `shopping_items` aktiviert und eine `postgres_changes`-Subscription ergänzt werden; derzeit aktualisieren Nutzer die Liste über den sichtbaren Aktualisieren-Button bzw. bei Screen-Wechsel. Offline werden App-Dateien, nicht ungesendete Datenänderungen, zwischengespeichert.
