from playwright.sync_api import expect, sync_playwright
from urllib.parse import quote
from uuid import uuid4

base = 'http://127.0.0.1:8790'
first = 'vless://00000000-0000-4000-8000-000000000001@example.com:443?security=tls&type=tcp#TEST_A'
second = 'vless://00000000-0000-4000-8000-000000000002@example.net:443?security=tls&type=tcp#TEST_B'
code = f'UITEST{uuid4().hex}'
link = base + '/c/' + code
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.goto(base + '/login', wait_until='domcontentloaded')
    page.locator('input[name=username]').fill('testuser')
    page.locator('input[name=password]').fill('testpass123')
    page.get_by_role('button', name='登录').click()
    page.wait_for_url(base + '/')
    inner = base + '/clash?config=' + quote(first, safe='') + '&ua=example'
    response = page.request.get(base + '/shorten-v2?url=' + quote(inner, safe='') + '&shortCode=' + code)
    assert response.ok
    link_label = page.get_by_text(link, exact=True)
    list_summary = page.locator('summary').filter(has_text='已有订阅')
    list_panel = list_summary.locator('..')
    expect(list_panel).not_to_have_attribute('open', '')
    list_summary.click()
    page.get_by_role('button', name='刷新列表').click()
    link_label.wait_for(state='attached')
    row = list_panel.locator('details').filter(has=link_label)
    expect(link_label).to_be_hidden()
    row.locator('summary').click()
    expect(link_label).to_be_visible()
    remark = row.get_by_role('textbox', name='订阅备注名')
    remark.fill('测试备注')
    row.get_by_role('button', name='保存备注').click()
    expect(row.get_by_role('status').filter(has_text='备注已保存')).to_be_visible()
    expect(row.locator('summary')).to_contain_text('测试备注')
    row.get_by_role('button', name='选择编辑').click()
    page.locator('#managedSources').wait_for(state='visible')
    assert page.locator('#managedSources').input_value() == first
    page.locator('#managedSources').fill(second)
    page.get_by_role('button', name='保存到原订阅').click()
    page.get_by_role('status').filter(has_text='已保存。固定链接').wait_for()
    r = page.request.get(link)
    assert r.ok and 'TEST_B' in r.text() and 'TEST_A' not in r.text()
    resolve = page.request.get(base + '/resolve?url=' + quote(link, safe='')).json()
    assert 'ua=example' in resolve['originalUrl']
    row.get_by_role('button', name='删除订阅').click()
    row.get_by_role('button', name='取消').click()
    assert page.request.get(link).ok
    row.get_by_role('button', name='删除订阅').click()
    row.get_by_role('button', name='确认删除').click()
    expect(list_panel.get_by_role('status').filter(has_text='已删除订阅')).to_be_visible()
    expect(row).to_have_count(0)
    expect(page.locator('#managedSources')).to_be_hidden()
    for prefix in 'bcxs':
        assert page.request.get(f'{base}/{prefix}/{code}').status == 404
    print('UI passed: collapsed list and rows, inline remark feedback, source edits, cancel and confirm deletion')
    browser.close()
