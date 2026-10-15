import sys,json,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.test-deps'))
from playwright.sync_api import sync_playwright
server=subprocess.Popen([sys.executable,'-m','http.server','3366','--bind','127.0.0.1','--directory',str(ROOT/'site')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
sample={'id':'111','type':'manga','attributes':{'canonicalTitle':'Dragon Ball','chapterCount':520,'status':'finished','subtype':'manga'},'relationships':{'mediaRelationships':{'data':[{'type':'mediaRelationships','id':'1'}]}}}
anime={'id':'199','type':'anime','attributes':{'canonicalTitle':'Dragon Ball','episodeCount':153,'status':'finished','subtype':'TV'}}
included=[{'id':'1','type':'mediaRelationships','attributes':{'role':'adaptation'},'relationships':{'destination':{'data':{'type':'anime','id':'199'}}}},anime]
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        context=browser.new_context(viewport={'width':1440,'height':1000})
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://fonts.googleapis.com/**',lambda route:route.abort())
        def kitsu(route):
            url=route.request.url
            if '/anime/' in url: data={'data':anime}
            elif '/manga/111?' in url: data={'data':sample,'included':included}
            else:data={'data':[sample], 'links':{}}
            route.fulfill(content_type='application/json',body=json.dumps(data),headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://kitsu.app/api/edge/**',kitsu)
        page.goto('http://127.0.0.1:3366/')
        page.get_by_text('Chaque collection commence par une histoire.').wait_for()
        page.locator('nav [data-view=discover]').click()
        page.locator('[data-add="manga:111"]').click()
        page.locator('nav [data-view=library]').click()
        page.locator('[data-increment="manga:111"]').click()
        assert page.evaluate("JSON.parse(localStorage.getItem('tsugi-library-v1')).entries[0].progress")==1
        page.locator('#library-grid .card-title[data-detail="manga:111"]').click()
        page.locator('#progress-form [name=progress]').fill('519')
        page.locator('#progress-form [name=status]').select_option('completed')
        page.locator('#progress-form button[type=submit],#progress-form button.primary').click()
        assert page.locator('#stat-completed').text_content()=='1'
        page.locator('nav [data-view=achievements]').click()
        assert page.locator('.achievement.unlocked').count()==3
        page.locator('nav [data-view=library]').click()
        page.reload();page.locator('#library-grid .card-title').wait_for()
        assert page.evaluate("JSON.parse(localStorage.getItem('tsugi-library-v1')).entries[0].progress")==519
        page.locator('#library-grid .card-title').click()
        page.locator('[data-relation="anime:199"]').click()
        page.locator('#detail-add').click()
        page.locator('#detail .close').click()
        page.locator('[data-kind=anime]').click()
        page.locator('[data-increment="anime:199"]').click()
        assert page.locator('#stat-episodes').text_content()=='1'
        page.locator('[data-kind=manga]').click()
        page.locator('nav [data-view=discover]').click();page.locator('#manual').click()
        page.locator('#manual-form [name=title]').fill('<img src=x onerror=alert(1)>')
        page.locator('#manual-form button').click()
        assert page.locator('.card-title').filter(has_text='<img src=x').count()==1
        assert page.locator('img[src=x]').count()==0
        page.locator('#library-search').fill('absent-title')
        page.get_by_text('Pas de titre dans cette sélection.').wait_for()
        page.locator('#library-search').fill('')
        with page.expect_download() as info:page.locator('.tools summary').click();page.locator('#export').click()
        assert info.value.suggested_filename.startswith('tsugi-')
        page.locator('.tools summary').click()
        page.locator('#sync-account').click()
        page.locator('#sync-email').wait_for()
        assert page.locator('#auth-password').is_visible()
        page.locator('.sync-close').click()
        (ROOT/'test-artifacts').mkdir(exist_ok=True)
        page.screenshot(path=str(ROOT/'test-artifacts/desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(ROOT/'test-artifacts/mobile.png'),full_page=True)
        page.locator('.card-title').first.click()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('#detail .close').click()
        assert not errors,errors
        print('UI PASS: search, add, +1, progress, completion, trophy, reload, anime adaptation, manual entry, XSS, filters, export, auth UI, mobile. No JS errors.')
        browser.close()
finally:server.terminate();server.wait()
