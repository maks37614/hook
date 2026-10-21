#!/usr/bin/env python3
"""Exercise the real PHP HTTP entrypoints without external network access."""
import http.cookiejar
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

if __name__ != '__main__':
    raise SystemExit('Run as a script')
php = os.environ.get('PHP_BINARY', 'php')
source = Path(__file__).resolve().parents[1]
checks = 0

def check(value, message):
    global checks
    checks += 1
    if not value:
        raise AssertionError(message)

with tempfile.TemporaryDirectory(prefix='.test-paper-http-', dir=source.parent) as directory:
    root = Path(directory)
    public = root / 'public'
    shutil.copytree(source, public, ignore=shutil.ignore_patterns('config.local.php', '.tmp-*'))
    private = root / 'private'
    sessions = root / 'sessions'
    sessions.mkdir()
    setup_key = 'test-installation-key-' + 'a' * 32
    config = public / 'config.local.php'
    config.write_text("<?php return ['setup_key' => '" + setup_key + "', 'data_dir' => '" + str(private) + "', 'require_https' => false];")
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    server = subprocess.Popen([php, '-n', '-d', 'session.save_path=' + str(sessions), '-d', 'display_errors=0', '-S', '127.0.0.1:' + str(port), '-t', str(public)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = 'http://127.0.0.1:' + str(port)
    jar = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def request(path='/', data=None, headers=None, anonymous=False):
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        req = urllib.request.Request(base + path, data=body, headers=headers or {})
        opener = urllib.request.build_opener() if anonymous else client
        try:
            response = opener.open(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, response.headers, response.read().decode('utf-8')

    def token(html):
        return re.search(r'name="csrf" value="([a-f0-9]+)"', html)[1]

    try:
        for _ in range(60):
            try:
                code, headers, html = request()
                break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError('PHP server exited')
                time.sleep(.05)
        else:
            raise RuntimeError('PHP server failed to start')
        check('Перший запуск' in html and 'Cron' not in html, 'setup form, no account disclosure')
        check('no-store' in headers.get('Cache-Control', ''), 'no cache')
        check("frame-ancestors 'none'" in headers.get('Content-Security-Policy', ''), 'CSP')
        check('HttpOnly' in headers.get('Set-Cookie', '') and 'SameSite=Strict' in headers.get('Set-Cookie', ''), 'cookie flags')
        check(request('/cron.php')[0] == 503, 'cron unavailable before installation')
        csrf = token(html)
        _, _, html = request(data={'csrf': csrf, 'setup_key': 'wrong', 'password': 'A-test-password-123', 'password_confirm': 'A-test-password-123'})
        check('Неправильний ключ' in html, 'setup key enforced')
        check(request('/cron.php')[0] == 503, 'failed setup cannot authorize cron')
        _, _, html = request(data={'csrf': token(html), 'setup_key': setup_key, 'password': 'A-test-password-123', 'password_confirm': 'A-test-password-123'})
        check('Ринок. Рішення. Результат.' in html, 'setup authenticates and renders dashboard')
        cron_key = re.search(r'Authorization: Bearer ([a-f0-9]{64})', html)[1]
        check(request('/cron.php')[0] == 401, 'cron requires dedicated credential')
        check(request('/cron.php?key=' + cron_key)[0] == 401, 'URL keys are rejected')
        check(request('/?export=csv', anonymous=True)[1].get_content_type() == 'text/html', 'anonymous cannot export ledger')
        _, _, bad = request(data={'csrf': 'bad', 'action': 'toggle'})
        check('Сесію форми втрачено' in bad, 'CSRF prevents mutation')
        _, _, bad = request(data={'csrf': token(html), 'action': 'toggle'})
        check('Спочатку збережіть токен' in bad, 'cannot enable without source')
        code, _, result = request('/cron.php', headers={'Authorization': 'Bearer ' + cron_key})
        check(code == 503 and json.loads(result)['status'] == 'degraded', 'authorized cron handles missing source without network')
        code, _, result = request('/cron.php', headers={'Authorization': 'Bearer ' + cron_key})
        check(code == 200 and json.loads(result)['status'] == 'too_soon', 'minimum interval enforced')
        _, _, html = request()
        _, _, html = request(data={'csrf': token(html), 'action': 'password', 'current_password': 'A-test-password-123', 'new_password': 'A-new-password-456'})
        check('Пароль змінено' in html, 'password can be changed')
        _, _, html = request(data={'csrf': token(html), 'action': 'logout'})
        check('Вхід до бота' in html and cron_key not in html, 'logout hides account and secrets')
        _, _, html = request(data={'csrf': token(html), 'password': 'A-test-password-123'})
        check('Неправильний пароль' in html, 'old password revoked')
        _, _, html = request(data={'csrf': token(html), 'password': 'A-new-password-456'})
        check('Ринок. Рішення. Результат.' in html, 'new password logs in')
        code, headers, csv = request('/?export=csv')
        check(code == 200 and headers.get_content_type() == 'text/csv' and 'net_pnl' in csv, 'authenticated CSV export')
        check(request('/tests/run.php')[0] == 404, 'test runner inaccessible via web')
        with (private / 'state.php').open() as handle:
            state = json.loads(handle.read().split('\n', 1)[1])
        check(state['balance'] == 1000 and state['settings']['enabled'] is False, 'unauthorized actions preserved ledger')
        config.write_text(config.read_text().replace("'require_https' => false", "'require_https' => true"))
        check(request()[0] == 400, 'HTTPS enforced on web entrypoint')
        check(request('/cron.php', headers={'Authorization': 'Bearer ' + cron_key})[0] == 400, 'HTTPS enforced on cron')
    finally:
        server.terminate()
        server.wait(timeout=5)
print(f'OK: {checks} HTTP checks')
