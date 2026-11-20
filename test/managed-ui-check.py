import json
from playwright.sync_api import expect, sync_playwright
from urllib.parse import parse_qs, quote, urlencode, urlsplit
from uuid import uuid4

base = 'http://127.0.0.1:8790'
first = 'vless://00000000-0000-4000-8000-000000000001@example.com:443?security=tls&type=tcp#TEST_A'
second = 'vless://00000000-0000-4000-8000-000000000002@example.net:443?security=tls&type=tcp#TEST_B'
code = f'UITEST{uuid4().hex}'
link = base + '/c/' + code
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    page = browser.new_page(viewport={'width': 390, 'height': 844}, locale='zh-CN')
    page.set_default_timeout(8000)
    page.goto(base + '/login', wait_until='domcontentloaded')
    page.locator('input[name=username]').fill('testuser')
    page.locator('input[name=password]').fill('testpass123')
    page.get_by_role('button', name='登录').click()
    page.wait_for_url(base + '/')
    page.evaluate("localStorage.setItem('advancedToggle', 'true')")
    page.reload(wait_until='domcontentloaded')
    expect(page.get_by_role('button', name='高级选项')).to_have_attribute('aria-expanded', 'false')
    page.locator('#input').fill(first)
    page.locator('form').filter(has=page.locator('#input')).locator('button[type=submit]').click()
    output = page.locator('input[readonly]').filter(visible=True).all()
    clash_links = [field.input_value() for field in output if field.input_value().startswith(base + '/clash?')]
    assert len(clash_links) == 1
    generated_rules = parse_qs(urlsplit(clash_links[0]).query)['selectedRules'][0]
    assert json.loads(generated_rules) == ['Location:CN', 'Private', 'Non-China']

    catalog = {
        'users': [
            {'email': 'TEST-EMAIL', 'servers': [{'id': 'a', 'name': '测试甲'}, {'id': 'b', 'name': '测试乙'}]},
            {'email': 'test-email', 'servers': [{'id': 'c', 'name': '测试丙'}]},
        ],
        'unavailable': [],
    }
    source_links = {'a': 'https://one.example/sub/TEST_A', 'b': 'https://two.example/sub/TEST_B'}
    source_requests = []
    fixture = {'partial': False}

    def fulfill_sources(route):
        assert route.request.method == 'POST'
        lookup = route.request.post_data_json
        source_requests.append(lookup)
        sources = [{'serverId': server, 'url': source_links[server]} for server in lookup['servers']
                   if not fixture['partial'] or server != 'b']
        route.fulfill(json={'sources': sources, 'unavailable': [{'id': 'b', 'name': '测试乙'}] if fixture['partial'] else []})

    page.route('**/manage-source-catalog', lambda route: route.fulfill(json=catalog))
    page.route('**/manage-source-links', fulfill_sources)
    managed_writes = []

    def record_managed_write(request):
        if request.method == 'POST' and urlsplit(request.url).path == '/manage-subscription':
            managed_writes.append(request.post_data_json)

    page.on('request', record_managed_write)
    new_picker = page.locator('form details').filter(has_text='从 3x-ui 选来源')
    new_picker.locator('summary').click()
    new_picker.get_by_role('combobox', name='客户端 Email').select_option('TEST-EMAIL')
    expect(new_picker.get_by_role('checkbox', name='测试丙')).to_have_count(0)
    for server in ('测试甲', '测试乙'):
        new_picker.get_by_role('checkbox', name=server).check()
    new_picker.get_by_role('button', name='预览来源').click()
    expect(new_picker.get_by_text('将填入的来源')).to_be_visible()
    assert source_requests[-1] == {'email': 'TEST-EMAIL', 'servers': ['a', 'b']}
    expect(page.locator('#input')).to_have_value(first)
    new_picker.get_by_role('button', name='填入输入框').click()
    expect(page.locator('#input')).to_have_value('\n'.join(source_links.values()))
    assert page.evaluate("localStorage.getItem('inputTextarea')") == first
    new_picker.locator('summary').click()

    page.get_by_role('button', name='高级选项').click()
    rule_picker = page.get_by_role('combobox', name='规则选择', include_hidden=True)
    expect(rule_picker).to_be_hidden()
    page.locator('summary').filter(has_text='规则选择').click()
    expect(rule_picker).to_have_value('minimal')
    rule_picker.select_option('balanced')
    expect(rule_picker).to_have_value('balanced')
    old_rules = ['Private', 'Location:CN', 'Non-China', 'Github']
    inner = base + '/clash?' + urlencode({'config': first, 'ua': 'example', 'selectedRules': json.dumps(old_rules)})
    response = page.request.get(base + '/shorten-v2?url=' + quote(inner, safe='') + '&shortCode=' + code)
    assert response.ok

    def stored_parameters():
        response = page.request.get(base + '/resolve?url=' + quote(link, safe=''))
        assert response.ok
        return parse_qs(urlsplit(response.json()['originalUrl']).query)

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
    original_sources = page.locator('#managedOriginalSources')
    picked_sources = page.locator('#managedPickedSources')
    manual_sources = page.locator('#managedSources')
    manual_summary = page.locator('summary').filter(has_text='手动编辑来源')
    save_managed = page.get_by_role('button', name='保存到原订阅')
    expect(original_sources).to_be_visible()
    expect(original_sources).to_have_value(first)
    expect(original_sources).not_to_be_editable()
    expect(manual_sources).to_be_hidden()
    expect(picked_sources).to_be_hidden()
    managed_picker = page.locator('section details').filter(has=page.locator('summary').filter(has_text='从 3x-ui 选来源'))
    managed_summary = managed_picker.locator('summary')
    managed_summary.click()
    expect(managed_picker.get_by_role('button', name='预览来源')).to_have_count(0)
    expect(managed_picker.get_by_role('button', name='替换来源草稿')).to_have_count(0)
    managed_picker.get_by_role('combobox', name='客户端 Email').select_option('TEST-EMAIL')
    server_b = managed_picker.get_by_role('checkbox', name='测试乙')
    fixture['partial'] = True
    server_b.check()
    expect(managed_picker.get_by_role('status')).to_contain_text('当前草稿已保留')
    assert source_requests[-1] == {'email': 'TEST-EMAIL', 'servers': ['b']}
    expect(save_managed).to_be_disabled()
    expect(picked_sources).to_be_hidden()
    expect(original_sources).to_have_value(first)
    assert stored_parameters()['config'] == [first] and not managed_writes

    fixture['partial'] = False
    server_b.uncheck()
    server_b.check()
    expect(picked_sources).to_be_visible()
    expect(picked_sources).to_have_value(source_links['b'])
    expect(picked_sources).not_to_be_editable()
    expect(save_managed).to_be_enabled()
    expect(original_sources).to_have_value(first)
    assert stored_parameters()['config'] == [first] and not managed_writes

    rule_summary = page.locator('summary').filter(has_text='修改这条订阅的分流规则')
    rule_summary.click()
    preset = page.get_by_label('已有订阅的分流规则')
    preset.select_option('minimal')
    page.get_by_role('button', name='取消编辑').click()
    expect(page.get_by_role('status').filter(has_text='已取消编辑')).to_be_visible()
    expect(original_sources).to_be_hidden()
    expect(picked_sources).to_be_hidden()
    assert not managed_writes
    params = stored_parameters()
    assert params['config'] == [first] and json.loads(params['selectedRules'][0]) == old_rules
    page.get_by_role('button', name='载入订阅').click()
    expect(original_sources).to_have_value(first)
    expect(preset).to_be_hidden()

    manual_summary.click()
    manual_sources.fill(second)
    expect(original_sources).to_have_value(first)
    saved = page.get_by_role('status').filter(has_text='已保存。固定链接')
    save_managed.click()
    expect(saved).to_be_visible()
    expect(original_sources).to_have_value(second)
    r = page.request.get(link)
    assert r.ok and 'TEST_B' in r.text() and 'TEST_A' not in r.text()
    params = stored_parameters()
    assert params['ua'] == ['example'] and json.loads(params['selectedRules'][0]) == old_rules
    assert [request['code'] for request in managed_writes] == [code]

    managed_summary.click()
    managed_picker.get_by_role('combobox', name='客户端 Email').select_option('TEST-EMAIL')
    for server in ('测试甲', '测试乙'):
        managed_picker.get_by_role('checkbox', name=server).check()
    selected_sources = '\n'.join(source_links.values())
    expect(picked_sources).to_have_value(selected_sources)
    expect(original_sources).to_have_value(second)
    assert stored_parameters()['config'] == [second] and len(managed_writes) == 1

    rule_summary.click()
    expect(preset).to_have_value('keep')
    preset.select_option('custom')
    rule_choices = page.locator('[x-model="managedSelectedRules"]')
    expect(rule_choices.and_(page.locator('[value="Github"]'))).to_be_checked()
    preset.select_option('minimal')
    save_managed.click()
    expect(saved).to_be_visible()
    expect(original_sources).to_have_value(selected_sources)
    expect(picked_sources).to_be_hidden()
    assert [request['code'] for request in managed_writes] == [code, code]
    params = stored_parameters()
    assert json.loads(params['selectedRules'][0]) == ['Location:CN', 'Private', 'Non-China']
    assert params['ua'] == ['example'] and params['config'] == [selected_sources]
    row.get_by_role('button', name='删除订阅').click()
    row.get_by_role('button', name='取消').click()
    assert stored_parameters()['config'] == [selected_sources]
    row.get_by_role('button', name='删除订阅').click()
    row.get_by_role('button', name='确认删除').click()
    expect(list_panel.get_by_role('status').filter(has_text='已删除订阅')).to_be_visible()
    expect(row).to_have_count(0)
    expect(original_sources).to_be_hidden()
    for prefix in 'bcxs':
        assert page.request.get(f'{base}/{prefix}/{code}').status == 404
    print('UI passed: automatic source preview, partial-source failure, cancel, fixed-link saves, remarks and deletion')
    browser.close()
