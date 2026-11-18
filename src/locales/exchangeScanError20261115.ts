/** Only display-level aliases for known exchange and browser network errors.
 * Unexpected provider error payloads remain unmodified and visible. */
import type { SupportedLanguage } from './types';
const rows=[
  [
    "Failed to fetch",
    "Не вдалося виконати мережевий запит",
    "Network request failed",
    "Сбой сетевого запроса",
    "Nie udało się wykonać żądania sieciowego"
  ],
  [
    "Load failed",
    "Не вдалося завантажити дані з мережі",
    "Network request failed",
    "Ошибка загрузки из сети",
    "Błąd pobierania z sieci"
  ],
  [
    "NetworkError when attempting to fetch resource.",
    "Мережева помилка під час отримання даних.",
    "Network error while fetching data.",
    "Сетевая ошибка при получении данных.",
    "Błąd sieci podczas pobierania danych."
  ],
  [
    "The operation was aborted.",
    "Запит було скасовано.",
    "The request was cancelled.",
    "Запрос был отменён.",
    "Żądanie zostało anulowane."
  ],
  [
    "This operation was aborted",
    "Запит скасовано",
    "The request was cancelled",
    "Запрос отменён",
    "Żądanie anulowano"
  ],
  [
    "The operation was aborted due to a timeout",
    "Перевищено час очікування запиту",
    "The request timed out",
    "Превышено время ожидания запроса",
    "Przekroczono limit czasu żądania"
  ],
  [
    "TimeoutError",
    "Перевищено час очікування",
    "Request timed out",
    "Превышено время ожидания",
    "Przekroczono limit czasu"
  ],
  [
    "AbortError",
    "Запит скасовано",
    "Request cancelled",
    "Запрос отменён",
    "Żądanie anulowane"
  ],
  [
    "Немає з'єднання з біржею",
    "Немає з'єднання з біржею",
    "No exchange connection",
    "Нет соединения с биржей",
    "Brak połączenia z giełdą"
  ],
  [
    "Спробуйте повторити запит",
    "Спробуйте повторити запит",
    "Try the request again",
    "Попробуйте повторить запрос",
    "Spróbuj ponowić żądanie"
  ],
  [
    "Сповіщення про помилку біржі",
    "Сповіщення про помилку біржі",
    "Exchange error notification",
    "Уведомление об ошибке биржи",
    "Powiadomienie o błędzie giełdy"
  ],
  [
    "Спот",
    "Спот",
    "Spot",
    "Спот",
    "Spot"
  ]
] as const;
const languages:SupportedLanguage[]=['uk','en','ru','pl'];
export const exchangeScanErrorPhrases=Object.fromEntries(languages.map((lang,i)=>[lang,Object.fromEntries(rows.map(r=>[r[0],r[i+1]]))])) as Record<SupportedLanguage,Record<string,string>>;
export const exchangeScanErrorRows=rows;
