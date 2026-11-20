from playwright.sync_api import sync_playwright
from urllib.parse import quote

base = 'http://127.0.0.1:8790'
first = 'vless://00000000-0000-4000-8000-000000000001@example.com:443?security=tls&type=tcp#TEST_A'
second = 'vless://00000000-0000-4000-8000-000000000002@example.net:443?security=tls&type=tcp#TEST_B'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.goto(base + '/login', wait_until='domcontentloaded')
    page.locator('input[name=username]').fill('testuser')
    page.locator('input[name=password]').fill('testpass123')
    page.get_by_role('button', name='登录').click()
    page.wait_for_url(base + '/')
    inner = base + '/clash?config=' + quote(first, safe='') + '&ua=example'
    response = page.request.get(base + '/shorten-v2?url=' + quote(inner, safe='') + '&shortCode=UITEST')
    assert response.ok
    page.get_by_placeholder('粘贴本站已有的订阅短链接').fill(base + '/c/UITEST')
    page.get_by_role('button', name='载入订阅').click()
    page.locator('#managedSources').wait_for(state='visible')
    assert page.locator('#managedSources').input_value() == first
    page.locator('#managedSources').fill(second)
    page.get_by_role('button', name='保存到原订阅').click()
    page.get_by_role('status').filter(has_text='已保存').wait_for()
    r = page.request.get(base + '/c/UITEST')
    assert r.ok and 'TEST_B' in r.text() and 'TEST_A' not in r.text()
    resolve = page.request.get(base + '/resolve?url=' + quote(base + '/c/UITEST', safe='')).json()
    assert 'ua=example' in resolve['originalUrl']
    print('UI test passed: same link, updated node, previous node absent, settings retained')
    browser.close()
