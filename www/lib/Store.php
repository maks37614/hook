<?php
declare(strict_types=1);

final class Store
{
    private $lock;
    private string $directory;
    private const PREFIX = "<?php http_response_code(404); exit; ?>\n";

    public function __construct(string $directory)
    {
        if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Не вдалося створити приватну папку даних');
        $real = realpath($directory);
        $documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
        $public = $documentRoot !== '' ? (realpath($documentRoot) ?: '') : '';
        if (!$real || ($public !== '' && $public !== '/' && ($real === $public || strpos($real, $public . DIRECTORY_SEPARATOR) === 0))) throw new RuntimeException('data_dir має бути поза публічним DOCUMENT_ROOT');
        $this->directory = $real;
    }

    public function acquire(bool $wait = false): bool
    {
        $this->lock = fopen($this->directory . '/lock.php', 'c+');
        if (!$this->lock) throw new RuntimeException('Не вдалося створити блокування');
        return flock($this->lock, LOCK_EX | ($wait ? 0 : LOCK_NB));
    }

    public function release(): void
    {
        if (is_resource($this->lock)) { flock($this->lock, LOCK_UN); fclose($this->lock); }
        $this->lock = null;
    }

    public function read(): ?array
    {
        $file = $this->directory . '/state.php';
        if (!is_file($file)) return null;
        $data = file_get_contents($file);
        if ($data === false || strpos($data, self::PREFIX) !== 0) throw new RuntimeException('Пошкоджене сховище; відновіть резервну копію');
        $state = json_decode(substr($data, strlen(self::PREFIX)), true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($state) || ($state['schema'] ?? null) !== 1 || !isset($state['balance'], $state['settings'])) throw new RuntimeException('Невідомий формат сховища');
        if (!is_array($state['settings']) || !Engine::positive($state['settings']['initialBalance'] ?? null)
            || !is_numeric($state['balance']) || !is_finite((float)$state['balance'])) throw new RuntimeException('Пошкоджений баланс або налаштування рахунку');
        foreach (['positions','history','seen'] as $field) if (!is_array($state[$field] ?? null)) throw new RuntimeException('Пошкоджений журнал рахунку');
        return Engine::upgrade($state);
    }

    public function write(array $state): void
    {
        if (!is_resource($this->lock)) throw new RuntimeException('Запис потребує блокування');
        $payload = self::PREFIX . json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
        if (strlen($payload) > 8 * 1024 * 1024) throw new RuntimeException('Ліміт даних 8 MB. Потрібен експорт і нова інсталяція');
        $temp = $this->directory . '/state-next.php';
        $handle = fopen($temp, 'wb');
        if (!$handle) throw new RuntimeException('Немає місця для запису');
        @chmod($temp, 0600);
        try {
            $length = strlen($payload); $written = 0;
            while ($written < $length) {
                $n = fwrite($handle, substr($payload, $written));
                if ($n === false || $n === 0) throw new RuntimeException('Неповний запис; попередні дані збережено');
                $written += $n;
            }
            if (!fflush($handle)) throw new RuntimeException('Не вдалося зберегти дані');
            if (function_exists('fsync') && !fsync($handle)) throw new RuntimeException('Не вдалося синхронізувати дані');
        } finally { fclose($handle); }
        if (!rename($temp, $this->directory . '/state.php')) throw new RuntimeException('Не вдалося замінити сховище');
    }

    public function __destruct() { $this->release(); }
}
