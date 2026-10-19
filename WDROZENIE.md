# Poprawki po audycie

Zmiany wykonano lokalnie na podstawie audytu `AUDYT.md`. Sześciu subagentów pracowało nad geometrią, walidacją, planerem, podglądem, zapisem/eksportem i CI. Zmiany zostały dodatkowo przejrzane między agentami oraz sprawdzone wspólnie przez agenta nadzorującego. Nie wykonywano push ani publikacji.

## Co zmieniono

- Geometria: wspólne wymiary i położenie otworów dla podglądu, pełnej ramki i części; prawidłowo wycięte ślepe otwory montażowe; podział uwzględniający wystające łączenia i kolizje z otworami; zgodna triangulacja stykających się powierzchni.
- Parametry: centralna walidacja zakresów, wartości skończonych i zależności wymiarowych, bezpieczne wpisywanie liczb, jawne wyłączenie zaokrągleń przy podziale zamiast cichej zmiany modelu.
- Planer: kontrola całego wielokąta paska względem materiału i otworów, obsługa myszy i dotyku z Pointer Events, klawiatura, wspólny stół z podglądem 3D, układ mobilny i zwijana pomoc.
- Podgląd: wspólna buforowana geometria, zmiana koloru bez ponownego generowania modelu, renderowanie na żądanie, pełne zwalnianie zasobów, ResizeObserver, dopasowanie kamery, komunikat przy braku WebGL.
- Projekt: lokalny autosave, wersjonowany import/eksport JSON, walidacja pliku, zachowanie uszkodzonego zapisu i wcześniejszej kopii odzyskiwania.
- Eksport: pojedynczy ZIP ze wszystkimi częściami, manifestem i instrukcją; wzorzec klucza motylkowego z liczbą potrzebnych kopii; odrzucanie uszkodzonych buforów i trójkątów o zerowym polu w STL.
- Drukarki: profile stołów i własne X/Y, sprawdzanie rzeczywistych obrysów części z dopuszczeniem obrotu o 90°, wspólna wizualizacja stołu w 2D i 3D.
- Interfejs: etykiety kontrolek, widoczny fokus, dialog z obsługą klawiatury, aktualizowany język dokumentu, rzeczywisty gabaryt heksagonu, opis masy pełnego modelu PLA i poprawne nazwanie ślepych otworów.
- Utrzymanie: Node >=24, testy regresji, poprawiony lint, workflow sprawdzający PR i budujący/wdrażający Pages po zmianie main, plik LICENSE i aktualna instrukcja.

## Zakres weryfikacji

Końcowe wyniki: **42/42 testy przechodzą**, TypeScript i ESLint bez błędów, build produkcyjny poprawny, `git diff --check` bez uwag.

Testy regresji obejmują topologię, kierunek sąsiadujących trójkątów, gabaryty segmentów, objętość, otwory, skrajne głębokości kieszeni, eksport, zapis projektu, walidację oraz podparcie pasków. Macierz geometryczna sprawdza **542 siatki z 93 poprawnych konfiguracji**; niemożliwe ułożenie złącza i otworu jest odrzucane przez osobny test walidacji. Testy zawierania punktów sprawdzają również zgodność wnętrza pełnej ramki i segmentów, ponieważ sama zgodność objętości nie wyklucza wzajemnie kompensujących się ubytków i nakładania materiału. Skrajny przypadek głębokiej kieszeni po poprawce nie ma ubytków ani nakładania materiału w dodatkowym sprawdzeniu 12 000 punktów.

W przeglądarce sprawdzono edycję wymiarów, odrzucenie zbyt głębokiej kieszeni, zmianę języka, przejście do podziału z zaokrąglonej ramki, przesuwanie/obrót/usuwanie paska klawiaturą, odtworzenie projektu po odświeżeniu, przełączanie 2D/3D, zmianę koloru i profilów stołu oraz układ przy szerokości 390 px. Rzeczywisty eksport i ponowny import projektu JSON zachowują ustawienia. ZIP pobrany z interfejsu zawiera komplet sześciu części przykładowej ramki i wzorzec klucza z poprawną liczbą sześciu kopii. Format ZIP sprawdzono również niezależnie przez `unzip -t` i Python `zipfile`, w tym CRC, długości rekordów STL i nazwy UTF-8.

## Ograniczenia funkcjonalne

- Otwory montażowe są ślepymi otworami walcowymi o przekroju 12-kąta, zgodnie z nowymi etykietami. Nie są złączem typu keyhole.
- Ramki dzielone mają ostre narożniki; pole promienia jest wyłączone z wyjaśnieniem.
- Sprawdzenie stołu obejmuje obrys XY i obrót o 90°. Użytkownik nadal ustawia brim/skirt, marginesy i orientację w slicerze.
- Masa odpowiada pełnej bryle PLA, bez symulacji infillu.
- Nie wykonywano próbnego druku ani weryfikacji w slicerze. Testy siatki nie zastępują kontroli mechanicznego dopasowania wydruku.
- Workflow Pages wymaga ustawienia źródła Pages na GitHub Actions w repozytorium. Nie uruchamiano wdrożenia.
- Pakiet renderera 3D ma 544,78 kB i nadal przekracza próg ostrzeżenia Vite 500 kB; jest ładowany osobno. Główny pakiet aplikacji ma 310,36 kB (gzip 98,10 kB), wcześniej około 798 kB (gzip 215 kB). Sumaryczna wielkość pobieranych plików przy wejściu w 3D nie zmniejsza się w tej proporcji.
