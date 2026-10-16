import json,sys,subprocess,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.test-deps'))
from playwright.sync_api import sync_playwright
def media(id,kind,title,total):return {'id':str(id),'type':kind,'attributes':{'canonicalTitle':title,'chapterCount':total if kind=='manga' else None,'episodeCount':total if kind=='anime' else None,'volumeCount':2 if kind=='manga' else None,'subtype':'TV' if kind=='anime' else 'manga','status':'finished','startDate':'2020-01-01' if id!=200 else '2021-01-01'},'relationships':{}}
manga=media(111,'manga','Dragon Ball',20);a1=media(199,'anime','Season One',12);a2=media(200,'anime','Season Two',24)
forward={'id':'f','type':'mediaRelationships','attributes':{'role':'sequel'},'relationships':{'destination':{'data':{'id':'200','type':'anime'}}}}
back={'id':'b','type':'mediaRelationships','attributes':{'role':'prequel'},'relationships':{'destination':{'data':{'id':'199','type':'anime'}}}}
a1['relationships']['mediaRelationships']={'data':[{'id':'f','type':'mediaRelationships'}]};a2['relationships']['mediaRelationships']={'data':[{'id':'b','type':'mediaRelationships'}]}
blocked=media(999,'manga','Blocked fixture',10);blocked['attributes']['ageRating']='R18'
def entry(id,title,kind='manga',total=None):return {'id':id,'title':title,'kind':kind,'progress':3,'status':'reading','manualTotal':total,'muId':None,'updated':1}
seed={'entries':[entry('manual:short','Short',total=10),entry('manual:long','Long',total=100),entry('manual:unknown','Unknown'),entry('manga:111','Dragon Ball'),entry('anime:199','Season One','anime')]}
server=subprocess.Popen([sys.executable,'-m','http.server','3368','--bind','127.0.0.1','--directory',str(ROOT/'site')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script("if(!localStorage.getItem('tsugi-library-v1'))localStorage.setItem('tsugi-library-v1',"+json.dumps(json.dumps(seed))+")")
        page.route('https://fonts.googleapis.com/**',lambda r:r.abort())
        def catalog(route):
            path=urlparse(route.request.url).path;requests.append(path)
            if path.endswith('/chapters'):result={'data':[{'attributes':{'number':n,'volumeNumber':1 if n<=10 else 2}} for n in range(1,21)],'meta':{'count':20}}
            elif '/manga/111' in path:result={'data':manga,'included':[]}
            elif '/anime/199' in path:result={'data':a1,'included':[forward,a2]}
            elif '/anime/200' in path:result={'data':a2,'included':[back,a1]}
            else:result={'data':[manga,blocked],'included':[],'links':{}}
            route.fulfill(content_type='application/json',body=json.dumps(result),headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://kitsu.app/api/edge/**',catalog)
        page.goto('http://127.0.0.1:3368/')
        page.wait_for_function('window.tsugiSync?.client && !refreshBusy')
        page.locator('#sort').select_option('size-asc')
        assert page.locator('#library-grid .card-title').first.text_content()=='Short'
        assert page.locator('#library-grid .card-title').last.text_content()=='Unknown'
        page.locator('#sort').select_option('size-desc')
        assert page.locator('#library-grid .card-title').first.text_content()=='Long'
        page.locator('#selection-toggle').click();page.locator('[data-select="manual:short"]').check()
        page.locator('[data-kind=anime]').click();page.locator('[data-select="anime:199"]').check()
        assert page.locator('#selection-count').text_content()=='2 sélectionnés'
        page.locator('#bulk-status').select_option('planned');page.locator('#bulk-apply').click()
        assert page.evaluate("library.entries.filter(e=>e.status==='planned').length")==2
        assert page.evaluate("library.entries.every(e=>e.progress===3)")
        assert page.locator('[data-status=planned] .category-count').text_content()=='1'
        page.locator('#selection-toggle').click()
        page.locator('nav [data-view=links]').click()
        page.locator('#links-form [name=title]').fill('Lecture préférée');page.locator('#links-form [name=url]').fill('https://example.com/lecture');page.locator('#links-form button').click()
        assert page.locator('#links-list a').get_attribute('href')=='https://example.com/lecture'
        page.locator('nav [data-view=library]').click();page.locator('[data-kind=manga]').click()
        page.locator('#library-grid [data-detail="manga:111"]').first.click()
        page.locator('.units-panel summary').first.click()
        assert page.locator('#unit-form').count()==0
        page.locator('#load-volumes').click();page.locator('[data-finish-unit="2"]').wait_for()
        page.locator('[data-finish-unit="2"]').click()
        assert page.evaluate("entryFor('manga:111').progress")==20
        assert page.evaluate("entryFor('manga:111').status")=='completed'
        assert page.evaluate('library.readingLinks.length')==1
        page.locator('#detail .close').click();page.locator('[data-kind=anime]').click()
        page.locator('#library-grid .card-title').click();page.locator('.units-panel summary').last.click();page.locator('#load-seasons').click()
        page.locator('#season-finish-form [name=count]').wait_for();page.locator('#season-finish-form [name=count]').fill('2');page.locator('#season-finish-form button').click()
        assert page.evaluate("library.entries.filter(e=>e.kind==='anime').map(e=>e.progress)")==[12,24]
        assert page.locator('#stat-episodes').text_content()=='36'
        page.locator('#detail .close').click()
        page.locator('nav [data-view=achievements]').click();assert page.evaluate('D.trophies.length')==200
        assert page.locator('#achievement-grid .achievement').count()==24
        page.locator('#trophy-search').fill('Shenron');assert page.locator('#achievement-grid .achievement').count()==1
        page.locator('nav [data-view=discover]').click();page.locator('[data-add="manga:111"],#catalog-grid [data-detail="manga:111"]').first.wait_for()
        assert page.locator('[data-detail="manga:999"]').count()==0
        # A second daily refresh does not contact a source again.
        before=len(requests);page.evaluate('refreshAll(false)');assert len(requests)==before
        page.set_viewport_size({'width':390,'height':844})
        for view in ['library','achievements','links']:
            page.locator(f'nav [data-view={view}]').click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),view
        page.locator('nav [data-view=library]').click();page.locator('[data-kind=manga]').click()
        page.screenshot(path=str(ROOT/'test-artifacts/features-mobile.png'),full_page=True)
        page.reload();page.wait_for_function('window.TsugiEnhancements')
        assert page.evaluate('library.readingLinks.length')==1
        assert page.evaluate("entryFor('manga:111').segments.length")==2
        assert not errors,errors
        print('PASS: mixed bulk move, category counts, size sorting, private links, tome conversion/import, season completion without duplicates, 200 paginated trophies, content filtering, daily refresh and mobile layout.')
        browser.close()
finally:server.terminate();server.wait()
