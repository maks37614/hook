import type { LocalizedGuides } from './guideTypes.ts';

export const pl: LocalizedGuides = {
  languageNavigation: 'Język strony',
  breadcrumbNavigation: 'Ścieżka nawigacji poradnika',
  moreGuides: 'Pozostałe narzędzia i poradniki h00k',
  screener: 'Skaner kryptowalut',
  terms: 'Regulamin',
  privacy: 'Polityka prywatności',
  pages: {
    scalping: {
      label: 'Scalping kryptowalut',
      title: 'Skaner kryptowalut do scalpingu na Binance i Bybit',
      description: 'Wyszukuj aktywne pary według wolumenu i zmienności. Sprawdzaj krótkie interwały, arkusz zleceń i wykonane transakcje w HookChart.',
      heading: 'Skaner kryptowalut do scalpingu',
      lead: 'W h00k możesz wybrać aktywne pary z Binance lub Bybit według wolumenu i zmienności. Potem otwórz wykres w HookChart i sprawdź, jak przebiega ruch na danym rynku.',
      open: 'Otwórz skaner',
      sections: [
        {
          heading: 'Jak wyszukiwać aktywne pary według wolumenu i zmienności',
          text: 'Wybierz Binance lub Bybit oraz rynek spot albo kontrakty futures. Włącz tryb „od” dla 24-godzinnego wolumenu i wpisz próg, aby skupić się na aktywnie handlowanych parach. Posortuj je według zmienności i przejrzyj świece 5-minutowe. Dzienny wolumen i krótkoterminowe wahania ceny opisują różne aspekty aktywności.',
        },
        {
          heading: 'Krótkie interwały i arkusz zleceń',
          text: 'Przejrzyj ostatnie świece, ich wolumen i pobliskie poziomy cenowe. Gdy dane są dostępne, arkusz zleceń pokazuje oczekujące oferty kupna i sprzedaży. Sumy dużych transakcji pod świecami dotyczą zrealizowanych zleceń rynkowych powyżej ustalonego progu. Znaczniki Liq pokazują zgłoszone likwidacje pozycji.',
        },
        {
          heading: 'Przykładowa lista na sesję',
          text: 'Posortuj kontrakty z jednej giełdy według wolumenu. Otwórz kilka par na wykresach 5-minutowych i porównaj zachowanie ceny w pobliżu lokalnego zakresu. Pary, które chcesz dalej obserwować, dodaj obok siebie w Terminalu.',
        },
      ],
      related: ['hookchart', 'terminal', 'liquidations', 'day-trading'],
    },
    'day-trading': {
      label: 'Day trading kryptowalut',
      title: 'Day trading kryptowalut i odtwarzanie sesji',
      description: 'Wybieraj pary do analizy intraday, porównuj interwały w Terminalu h00k i odtwarzaj historyczne sesje świeca po świecy w Market Replay.',
      heading: 'Narzędzia do day tradingu kryptowalut',
      lead: 'Przygotuj listę obserwowanych par na sesję, zaznacz poziomy na wyższym interwale i śledź wybrane wykresy w jednym oknie Terminala.',
      open: 'Otwórz Market Replay',
      sections: [
        {
          heading: 'Przygotowanie przed sesją',
          text: 'Zacznij od 24-godzinnego wolumenu i zmiany ceny w skanerze. Otwórz interesujące pary na wykresie godzinnym i zaznacz granice bieżącego zakresu. Sprawdź giełdę i typ rynku. Rynek spot i kontrakty na ten sam symbol mają osobne notowania.',
        },
        {
          heading: 'Kontekst godzinowy i świece 15-minutowe',
          text: 'Dodaj w Terminalu dwa wykresy tej samej pary z różnymi interwałami. Wykres godzinny może pokazywać zakres sesji, a 15-minutowy przebieg ruchu przy zaznaczonym poziomie. Aby otrzymać powiadomienie po osiągnięciu tej ceny, ustaw alert z odpowiednim warunkiem.',
        },
        {
          heading: 'Analiza sesji w Market Replay',
          text: 'Wybierz instrument oraz historyczny moment rozpoczęcia. Odsłaniaj kolejne świece pojedynczo i zaznaczaj poziomy widoczne na danym etapie. Po przejściu wybranego odcinka porównaj swój scenariusz z informacjami dostępnymi w chwili decyzji.',
        },
      ],
      related: ['terminal', 'crypto-patterns', 'market-replay', 'alerts'],
    },
    hookchart: {
      label: 'Wykresy HookChart',
      title: 'HookChart — wykresy kryptowalut Binance i Bybit',
      description: 'Analizuj wykresy świecowe w HookChart z narzędziami do rysowania, wolumenem, arkuszem zleceń, open interest i likwidacjami.',
      heading: 'Wykresy świecowe kryptowalut w HookChart',
      lead: 'HookChart to wykres wbudowany w h00k. Zaloguj się i otwórz parę ze skanera, aby przejrzeć historię cen, zaznaczyć poziomy i sprawdzić dostępne dane rynkowe.',
      open: 'Znajdź parę w skanerze',
      sections: [
        {
          heading: 'Odczytaj świece i zaznacz poziomy',
          text: 'Kursor z krzyżem pomaga odczytać czas i cenę. Wysuń pasek narzędzi, aby dodać poziomą linię lub linię trendu. Rozwiń wykres, jeśli potrzebujesz więcej miejsca na historię i oznaczenia.',
        },
        {
          heading: 'Wolumen, arkusz zleceń i likwidacje',
          text: 'Wolumen świecy pokazuje aktywność w danym interwale. Pod świecami mogą być widoczne sumy wykonanych transakcji rynkowych powyżej wybranego progu. Znaczniki Liq oznaczają zgłoszone przymusowe zamknięcia długich i krótkich pozycji. Modelowane strefy likwidacji, tam gdzie są dostępne, przedstawiają szacunkowe poziomy.',
        },
        {
          heading: 'Otwarte pozycje (open interest) na wykresach futures',
          text: 'Open interest odzwierciedla liczbę otwartych kontraktów na rynku terminowym. Arkusz zleceń, likwidacje i inne warstwy zależą od giełdy oraz instrumentu. Jeśli widzisz wolumen świec bez wartości open interest, sprawdź, czy został wybrany rynek kontraktów.',
        },
      ],
      related: ['scalping', 'crypto-patterns', 'liquidations', 'terminal'],
    },
    'crypto-patterns': {
      label: 'Formacje cenowe',
      title: 'Skaner formacji W i M na rynku kryptowalut',
      description: 'Wyszukuj podwójne dno W, podwójny szczyt M i wczesne układy. Sprawdzaj linię szyi, wybicie i poziomy scenariusza w HookChart.',
      heading: 'Wyszukiwanie formacji W i M na kryptowalutach',
      lead: 'Po zalogowaniu w sekcji „Formacje” możesz wyszukać podwójne dno (W) i podwójny szczyt (M). Wybierz giełdę, rynek oraz interwał, aby obejrzeć układy na interesujących Cię parach.',
      open: 'Otwórz Formacje',
      sections: [
        {
          heading: 'Podwójne dno (W) i podwójny szczyt (M)',
          text: 'W formacji W dwa minima dzieli lokalne maksimum. W formacji M dwa maksima dzieli lokalne minimum. Ten środkowy punkt wyznacza linię szyi. Wyświetl wykres i sprawdź świece oraz wolumen w pobliżu tego poziomu, a po wybiciu zwróć uwagę na ewentualny retest.',
        },
        {
          heading: 'Zwykły skan i wczesne wykrywanie',
          text: 'Zwykły skan pokazuje wykryte układy wraz z ich oceną. Tryb wczesnego wykrywania osobno analizuje zamknięte świece, aby pokazać potencjalną formację jeszcze przed potwierdzonym wybiciem. Podgląd zawiera linię szyi i poziomy obliczone dla danego scenariusza.',
        },
        {
          heading: 'Zweryfikuj układ w HookChart',
          text: 'Otwórz wybrany wynik i porównaj oznaczenia z przebiegiem świec. Sprawdź giełdę, interwał i dostępność danych. Ocena służy do porównywania struktur. Wejście, stop i cel opisują obliczony scenariusz.',
        },
        {
          heading: 'Open interest, delta wolumenu i CVD',
          text: 'W standardowym widoku formacji zmiana open interest (OI) pokazuje zmianę liczby otwartych kontraktów futures. Delta wolumenu porównuje aktywne kupno i sprzedaż dla ostatniej zamkniętej świecy. CVD sumuje deltę z 20 zamkniętych świec. Filtry delty i CVD w tym widoku korzystają z danych Binance spot lub futures.',
        },
      ],
      related: ['hookchart', 'day-trading', 'market-replay', 'alerts'],
    },
    terminal: {
      label: 'Terminal wielowykresowy',
      title: 'Terminal kryptowalut z wieloma wykresami HookChart',
      description: 'Obserwuj wykresy Binance i Bybit w jednym oknie. Porównuj pary oraz interwały w konfigurowalnej siatce Terminala h00k.',
      heading: 'Terminal h00k z wieloma wykresami',
      lead: 'Korzystaj z kilku wykresów HookChart na jednym ekranie, żeby porównywać instrumenty lub analizować ten sam rynek na różnych interwałach.',
      open: 'Otwórz Terminal',
      sections: [
        {
          heading: 'Dodaj instrumenty do siatki',
          text: 'Zaloguj się, otwórz Terminal i wyszukaj pary, które chcesz dodać. Każdy blok ma własną giełdę, typ rynku i interwał. Możesz na przykład umieścić BTCUSDT z Binance Futures obok pary z Bybit.',
        },
        {
          heading: 'Porównuj świece na wspólnym interwale',
          text: 'Ustaw ten sam interwał w dwóch blokach, aby porównać przebieg ruchu. Jeśli potrzebujesz szerszego kontekstu dla jednej pary, dodaj ją dwa razy i wybierz 5 minut w pierwszym bloku, a godzinę w drugim. Automatyczne dopasowanie skali pomaga zmieścić świece w widocznym obszarze.',
        },
        {
          heading: 'Przygotuj widok na kolejne sesje',
          text: 'Ułóż wykresy według tego, jak często na nie patrzysz, albo wybierz gotowy układ. Dodaj obserwowane pary do ulubionych, żeby szybko odszukać je podczas kolejnej sesji.',
        },
      ],
      related: ['hookchart', 'scalping', 'day-trading'],
    },
    alerts: {
      label: 'Alerty cenowe',
      title: 'Alerty cenowe kryptowalut na Telegramie',
      description: 'Ustaw próg cenowy dla pary z Binance lub Bybit. Połącz Telegram z h00k i sprawdzaj zadziałanie alertu i status dostarczenia.',
      heading: 'Alerty cenowe kryptowalut na Telegramie',
      lead: 'Ustaw alert dla ceny, którą chcesz obserwować na Binance lub Bybit. Zaloguj się, aby tworzyć powiadomienia i połączyć czat w Telegramie.',
      open: 'Otwórz skaner',
      sections: [
        {
          heading: 'Wybierz parę i warunek cenowy',
          text: 'Otwórz menu alertów w nagłówku h00k. Wybierz giełdę, rynek spot lub futures, symbol i cenę docelową. Warunek „co najmniej” sprawdza górny próg, a „co najwyżej” dolny. Aby obserwować oba krańce zakresu, utwórz dwa alerty.',
        },
        {
          heading: 'Połącz Telegram i sprawdź historię',
          text: 'Wykonaj kroki widoczne w ustawieniach połączenia z Telegramem i sprawdź, czy połączenie jest potwierdzone. Po uruchomieniu alertu możesz w historii sprawdzić zapisaną cenę, godzinę oraz status dostarczenia wiadomości.',
        },
        {
          heading: 'Próg cenowy lub zdarzenie rynkowe',
          text: 'Alert cenowy dotyczy jednego poziomu na konkretnej parze. SignalHook obserwuje wybrane rodzaje zdarzeń dla dodanych monet. Po odebraniu powiadomienia otwórz właściwy rynek w HookChart, aby obejrzeć świece z tego momentu.',
        },
        {
          heading: 'Powiadomienia w przeglądarce na h00k',
          text: 'Kliknij dzwonek w nagłówku, aby otworzyć centrum powiadomień. W jego ustawieniach wybierz kategorie, na przykład aktywowane alerty cenowe lub likwidacje, i w razie potrzeby włącz dźwięk. Dostarczanie wiadomości przez Telegram ustawisz w menu alertów cenowych.',
        },
      ],
      related: ['hookchart', 'day-trading', 'crypto-patterns'],
    },
    'market-replay': {
      label: 'Symulator Market Replay',
      title: 'Symulator handlu kryptowalutami · Market Replay',
      description: 'Odtwarzaj historyczne świece Binance i Bybit. Testuj pomysły ręcznie w Market Replay z wirtualnym saldem i zleceniami.',
      heading: 'Market Replay i symulator handlu kryptowalutami',
      lead: 'Wybierz datę i odtwarzaj historyczny wykres we własnym tempie. W Market Replay możesz ręcznie testować scenariusze na danych historycznych za pomocą wirtualnych zleceń.',
      open: 'Otwórz Market Replay',
      sections: [
        {
          heading: 'Jak uruchomić odtwarzanie świec',
          text: 'Wybierz giełdę, rynek, parę, interwał i datę rozpoczęcia. Po załadowaniu danych uruchom odtwarzanie z wybraną prędkością lub przesuwaj wykres świeca po świecy, aby zobaczyć przebieg ruchu.',
        },
        {
          heading: 'Zlecenia wirtualne, prowizja i poślizg cenowy',
          text: 'Ustaw wirtualne saldo, prowizję i poślizg cenowy. Złóż wirtualne zlecenie i sprawdź zachowanie poziomów stop i celu w wybranej sesji. Historia symulacji umożliwia przejrzenie transakcji wykonanych podczas ćwiczenia.',
        },
        {
          heading: 'Przykład ręcznego testu wybicia',
          text: 'Zatrzymaj wykres w pobliżu lokalnego zakresu i zaznacz jego granice. Odsłaniaj kolejne świece pojedynczo. Powtórz ćwiczenie dla innej daty z tymi samymi ustawieniami prowizji i poślizgu, aby porównać oba przebiegi.',
        },
      ],
      related: ['day-trading', 'hookchart', 'crypto-patterns', 'scalping'],
    },
    liquidations: {
      label: 'Mapa likwidacji kryptowalut',
      title: 'Mapa likwidacji Binance i Bybit w HookChart',
      description: 'Sprawdzaj likwidacje longów i shortów na wykresie futures. Przeglądaj mapę zgłoszonych zdarzeń za 24 godziny lub 7 dni.',
      heading: 'Mapa likwidacji kryptowalut w HookChart',
      lead: 'HookChart oznacza zgłoszone likwidacje na wykresach kontraktów Binance i Bybit. Otwórz mapę Liq, aby zestawić historię zdarzeń z zakresem cen.',
      open: 'Znajdź parę futures',
      sections: [
        {
          heading: 'Likwidacje pozycji long i short na wykresie',
          text: 'Znaczniki L i S oznaczają zgłoszone przymusowe zamknięcia pozycji długich i krótkich. W ustawieniach HookChart można włączać znaczniki dla każdej strony i ustawić osobny minimalny próg wartości.',
        },
        {
          heading: 'Jak czytać mapę cieplną likwidacji',
          text: 'Otwórz parę futures i wybierz ikonę mapy. Gdy archiwum zawiera dane, możesz przełączać okres między 24 godzinami a 7 dniami. Jaśniejsze pasma odpowiadają wyższej łącznej wartości zdarzeń w danym przedziale cenowym. Sprawdzaj komunikat o kompletności danych.',
        },
        {
          heading: 'Zarejestrowane zdarzenia i modelowane strefy',
          text: 'Archiwum Liq grupuje wcześniejsze zdarzenia giełdowe według ceny. Opcjonalne strefy modelowane wykorzystują powtarzające się poziomy w historii, gdy dostępnych jest wystarczająco dużo danych. Analizując ruch, porównaj zdarzenia ze świecami i wolumenem z tego samego okresu.',
        },
      ],
      related: ['hookchart', 'scalping', 'alerts'],
    },
  },
};
