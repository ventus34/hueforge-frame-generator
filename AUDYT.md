# Audyt FrameGen 3D

> Raport historyczny stanu przed poprawkami. Wdrożone zmiany i końcowa weryfikacja są opisane w [WDROZENIE.md](WDROZENIE.md). Pierwotne pomiary zachowano w `audit/geometry-baseline.json`.

Data: 19 października 2026. Repozytorium: https://github.com/ventus34/hueforge-frame-generator
Commit: `59e78372d0969f447f4894f951541382ce16f942`.

## Wniosek

Projekt ma niewielki zestaw zależności produkcyjnych i sensownie oddziela interfejs od generatora geometrii. Kompiluje się poprawnie. Największa wartość kolejnych prac to poprawność eksportu i wymiarów, następnie walidacja i automatyczne testy. Rozbudowę wyglądu zostawiłbym na później.

Kod aplikacji pozostawiono bez zmian. Dodano ten raport, skrypt diagnostyczny i wyniki w `audit/`. Nie wykonywano push ani publikacji.

## Weryfikacja

- Node 24.19.0; zależności z package-lock.json, zaimportowane do tymczasowego lockfile pnpm; wersje React 19.2.7, Vite 8.0.16, TypeScript 6.0.3 i ESLint 10.4.1 zgodne z package-lock.json. Skrypty instalacyjne wyłączone.
- `tsc -b`: OK.
- `vite build`: OK. JS 798,40 kB / gzip 214,85 kB; ostrzeżenie o dużym pakiecie.
- `eslint .`: 12 błędów w dwóch plikach.
- `node audit/geometry-audit.mjs`: 15 konfiguracji, w tym pełne ramki i 72 segmenty; pomiary wymiarów, objętości, zdegenerowanych trójkątów, zgodności normalnych i liczby użyć krawędzi. Dodatkowo punktowa kontrola dopasowania half-lap.
- Nie wykonywano testów interfejsu w przeglądarce, druku próbnego ani walidacji w slicerze. Nie przeprowadzono audytu podatności zależności. Kontrola krawędzi nie wykrywa wszystkich samoprzecięć, nakładających się powierzchni ani błędów dopasowania.

## Ustalenia według priorytetu

### 1. P1 — Otwory montażowe naruszają topologię siatki

Źródła: `src/utils/geometry.ts:114`, `:682`, `:772`, `:1724`, `:2087`.

Dla domyślnej ramki 200 × 200 mm bez otworów kontrola znajduje 0 nieparowanych krawędzi i 0 zdegenerowanych trójkątów. Po dodaniu jednego otworu: 12 nieparowanych krawędzi i 4 zdegenerowane trójkąty; dla dwóch: odpowiednio 24 i 8. To potwierdza problem topologiczny, choć same nieparowane krawędzie mogą również oznaczać T-junctions, a nie fizycznie otwarte dziury.

W ramce dzielonej dolna powierzchnia segmentu jest generowana w całości, a następnie dopisywane są powierzchnie cylindra bez wycięcia istniejącej powierzchni. Dodatkowo otwór przypisywany jest do części na podstawie samego środka, bez uwzględnienia promienia i łączenia. Dla ramki 180 × 180 mm, limitu 100 mm i jednego górnego otworu problem występuje dla wszystkich trzech rodzajów łączeń.

Poprawka: wspólne tworzenie powierzchni z otworami, zgodny podział granic siatki, usuwanie zerowych trójkątów i kontrola kolizji z łączeniami. Testy powinny obejmować otwory blisko szwu, narożnika oraz minimalnej szerokości i wysokości ramki. Przed uznaniem eksportu za poprawny potrzebna jest kontrola w slicerze.

### 2. P1 — Maksymalna długość części nie uwzględnia wystających łączeń

Źródła: `src/utils/geometry.ts:982`, `:1100`, `:1224`, `:1333`.

Reprodukcja: wPic = lPic = 180, maxPartLength = 100, pozostałe wartości domyślne. Długość nominalna segmentu wynosi 98,2 mm. Rzeczywisty wymiar STL to 105,7 mm dla half-lap i do 106,2 mm dla dovetail. Część przekracza zadany limit. Obrót na stole może pomóc w niektórych przypadkach, ale nie naprawia niespełnionej obietnicy maksymalnej długości.

Poprawka: liczyć podział z zapasem na geometrię łączeń i sprawdzać rzeczywiste gabaryty wynikowych części. Docelowo dodać profile stołu X × Y z kontrolą orientacji.

### 3. P1 — Brak centralnej walidacji wartości wejściowych

Źródła: `src/components/ControlPanel.tsx:42`, `:224`, `:568`; publiczne funkcje `src/utils/geometry.ts`.

Pola number zapisują wartości bez pełnego ograniczenia zakresu; atrybuty min/max nie blokują wywołania onChange dla wartości spoza zakresu. Wartości ujemne lub bardzo duże trafiają do generatora. W szczególności maxPartLength = 0 przekazane bezpośrednio do generatora oznacza nieskończoną liczbę iteracji; bardzo mała dodatnia wartość wpisana jako liczba całkowita lub ogromny wymiar mogą też wywołać kosztowne generowanie. Nie uruchamiano przypadku z nieskończoną pętlą.

Reguła pozostawienia 2 mm pod kieszenią również nie jest konsekwentna: korekta następuje dopiero przy dPocket >= height, więc height = 12 i dPocket = 11 przechodzą mimo limitu suwaka 10.

Poprawka: jedna walidacja dla formularza, presetów i eksportu: Number.isFinite, zakresy, relacje między wymiarami, limit liczby części. Przy błędzie czytelny komunikat i blokada eksportu. Osobny tekstowy stan edytowanego pola pozwoli normalnie usuwać i wpisywać cyfry.

### 4. P2 — Ukryty wymiar prostokąta zmienia geometrię heksagonu

Źródła: `src/utils/geometry.ts:392`, `:398`, `:808`, `:814`, w porównaniu z `:973`.

W trybie hex lPic ma być ignorowane, ale generator pełnej ramki i kalkulator objętości używają go do ograniczenia szerokości półki. Dla wPic = 200, sShelf = 40, zmiana ukrytego lPic z 200 na 50 zmniejsza objętość z około 269,335 do 197,474 cm³. Generator segmentów heksagonu używa tylko wPic, więc pełna ramka i jej części mogą mieć różne półki.

Poprawka: wspólna funkcja wyliczająca efektywne wymiary dla wybranego kształtu. Test: zmiana lPic nie zmienia żadnego wyniku dla hex.

### 5. P2 — Podział prostokąta ignoruje promień narożników

Źródła: `src/utils/geometry.ts:971–1145`, `:1205`; porównanie z `:656`.

Pełna ramka uwzględnia cornerRadius. Generowanie segmentów używa prostych profili i narożników miter, bez użycia cornerRadius. Włączenie podziału zmienia zatem kształt ramki, mimo zachowania ustawienia w formularzu.

Poprawka: obsłużyć łuki w częściach narożnych albo jawnie wyłączyć to ustawienie z wyjaśnieniem w trybie podziału.

### 6. P2 — Planer rzepów sprawdza tylko cztery narożniki

Źródła: `src/components/MountingPlanner.tsx:272`, `:317`; `src/components/ThreePreview.tsx:345`, `:392`.

Obszar ramki zawiera otwór, więc cztery poprawne narożniki nie gwarantują podparcia całego prostokąta. Przykład dla domyślnej ramki: rzep custom 204 × 4 mm ze środkiem (0, 0) ma narożniki na bocznych listwach, a środek nad otworem; obecny algorytm oznaczy go jako poprawny. Nie uwzględnia też otworów montażowych. Logika jest powielona w 2D i 3D.

Poprawka: wspólny test zawierania całego wielokąta rzepu w obszarze materiału, z uwzględnieniem wewnętrznego otworu, zaokrągleń i wycięć.

### 7. P2 — Keyhole w opisie nie odpowiada generowanej geometrii

Źródła: README, tłumaczenia oraz `src/utils/geometry.ts:114`, `:773`.

Kod generuje ślepy otwór o przekroju dwunastokąta. Nie ma poszerzonej komory na łeb śruby i węższego kanału charakterystycznego dla keyhole. To istotna różnica funkcjonalna dla użytkownika planującego zawieszenie ramki.

Poprawka: wdrożyć faktyczny profil keyhole i przetestować jego wymiary lub zmienić nazwy oraz opisy na zgodne z istniejącą funkcją.

### 8. P2 — Brak automatycznej kontroli jakości i powtarzalnego wdrożenia

Źródła: `package.json`, `eslint.config.js`, katalog `docs/`, brak `.github/workflows/`.

Brak testów i CI. Lint zgłasza dwa any w ControlPanel i dziesięć problemów z przypisaniami/const w geometry.ts. docs zawiera ręcznie zapisany build. W tym audycie nazwy i rozmiary wygenerowanych assetów odpowiadają obecnemu buildowi docs, więc nie stwierdzono jego nieaktualności; problemem jest brak automatycznego zabezpieczenia na przyszłość.

Poprawka: CI z instalacją z lockfile, lintem, kompilacją i testami geometrii; GitHub Pages z artefaktu build. Kluczowe testy: poprawne gabaryty, skończone współrzędne, topologia, zgodność pełnej ramki i segmentów, dopasowanie par łączeń i eksport STL.

README deklaruje Node >=18, podczas gdy zainstalowany Vite wymaga ^20.19.0 lub >=22.12.0. Dodać engines i wskazać wspieraną wersję Node. README deklaruje MIT, ale repozytorium nie zawiera pliku LICENSE.

### 9. P2 — Niepotrzebne przeliczanie i niepełne zwalnianie zasobów 3D

Źródła: `src/components/ThreePreview.tsx:94`, `:118`, `:144`, `:312`; `src/components/ControlPanel.tsx:610`.

Zmiana koloru usuwa siatki i ponownie generuje całą geometrię. Lista części w panelu generuje ją niezależnie od podglądu, a eksport wykonuje kolejną generację. Renderowanie działa stale również przy nieruchomym widoku. Cleanup nie wywołuje controls.dispose() i pomija zasoby GridHelper/AxesHelper, bo zwalnia tylko THREE.Mesh.

Poprawka: wspólny useMemo z geometrią zależną od parametrów, osobny efekt koloru, pełny cleanup kontrolek i helperów, ResizeObserver. Renderowanie na żądanie z podtrzymaniem klatek podczas tłumienia OrbitControls. Dopiero po pomiarach rozważyć Web Workera.

Pakiet JS ma około 798 kB; wydzielenie podglądu 3D do dynamicznego importu umożliwi osobne ładowanie. Nie gwarantuje to szybszego startu przy domyślnie otwartej zakładce 3D — potrzebny pomiar.

### 10. P2/P3 — Dostępność i wygoda pracy

Źródła: `src/components/MountingPlanner.tsx:347`, `:382`, `:509`; `src/components/ControlPanel.tsx:211`, `:678`; `src/App.tsx:39`, `:48`.

- Drag działa przez zdarzenia myszy; brak odpowiedników Pointer Events dla dotyku i obsługi przeciągania klawiaturą.
- Planer ma sztywną kolumnę 280 px, co wymaga dostosowania do wąskiego ekranu. Nie testowano faktycznego renderowania mobilnego.
- Pola liczbowe nie mają powiązanych label; przyciski kolorów polegają na title. Modal nie zarządza fokusem i nie ma semantyki dialogu.
- html lang jest ustawione na pl mimo domyślnego interfejsu en; przełączenie języka nie aktualizuje atrybutu.
- Brak zapisu projektu: odświeżenie usuwa parametry, rzepy i wybrany język.
- Eksport wszystkich części uruchamia serię pobrań, co może wywoływać ograniczenia przeglądarki. Przydatne będzie jedno archiwum ZIP z opisem liczby części i potrzebnych kluczy bowtie.
- Waga to objętość pełnej bryły × gęstość PLA; nie uwzględnia infillu ani ustawień slicera. Podpisać jako masę pełnego modelu lub dodać wyraźne przybliżenie.
- HUD heksagonu podaje poprawnie wymiar bok–bok, ale warto dodać rzeczywisty gabaryt X × Y do oceny stołu: dla ustawień domyślnych to około 249,88 × 216,40 mm.

## Zalecana kolejność prac

1. Wspólna walidacja parametrów i testy regresji dla potwierdzonych błędów.
2. Poprawienie otworów i kontroli rzeczywistych gabarytów segmentów; weryfikacja STL w slicerze.
3. Ujednolicenie wymiarów heksagonu, promieni i walidacji rzepów.
4. Naprawa linta, CI i automatyczne wdrażanie GitHub Pages.
5. Zapis/odczyt projektu JSON, autosave lokalny, ZIP części i profile drukarek.
6. Optymalizacja podglądu, dostępność i obsługa telefonu.

## Odtworzenie pomiarów

```sh
# Wymagany Node >=24 do bezpośredniego importu TypeScript w skrypcie audytu.
node audit/geometry-audit.mjs > audit/geometry-results.json
```

Skrypt jest narzędziem diagnostycznym, a nie zestawem testów akceptacyjnych: zapisuje wykryte problemy i nie kończy się niezerowym statusem z ich powodu. Wyniki znajdują się w `audit/geometry-results.json`.
