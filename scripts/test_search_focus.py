"""Search remains usable during a real sync cycle, including remote updates."""
import sys, subprocess, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.test-deps'))
from playwright.sync_api import sync_playwright

server = subprocess.Popen([sys.executable, '-m', 'http.server', '3367', '--bind', '127.0.0.1', '--directory', str(ROOT / 'site')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        for viewport in [{'width':1440,'height':1000}, {'width':390,'height':844}]:
            page = browser.new_page(viewport=viewport)
            page.route('https://fonts.googleapis.com/**', lambda route: route.abort())
            page.route('https://kitsu.app/api/edge/**', lambda route: route.fulfill(content_type='application/json', body='{"data":[],"links":{}}'))
            page.goto('http://127.0.0.1:3367/')
            page.wait_for_function('window.tsugiSync?.client && window.tsugiSync?.db')
            page.evaluate('''async () => {
                const sync = tsugiSync;
                clearInterval(sync.interval);
                const user = {id:'focus-test', email:'focus@example.test'};
                sync.user = user;
                sync.client = {auth:{getSession:async()=>({data:{session:{user,access_token:'test-only'}}})}};
                window.supabase.createClient = () => ({rpc:async()=>({data:{revision:2}})});
                window.remoteDoc = {entries:[]};
                sync.remote = async()=>({revision:1,document:window.remoteDoc});
                await sync.metadata({owner:user.id,revision:1,base:{entries:[]}});
                const metadata = sync.metadata.bind(sync);
                sync.metadata = async value => {
                    await new Promise(resolve=>window.finishCommit=resolve);
                    await metadata(value);
                };
            }''')
            for selector, view in [('#library-search','library'), ('#catalog-query','discover')]:
                page.locator(f'nav [data-view={view}]').click()
                field = page.locator(selector)
                field.fill('Dragon Ball')
                field.evaluate('(el)=>el.setSelectionRange(2,5)')
                page.evaluate('()=>{window.syncCycle=tsugiSync.runCycle();}')
                page.wait_for_function('typeof window.finishCommit === "function"')
                assert field.evaluate('(el)=>document.activeElement===el'), 'Sync stole search focus'
                assert field.evaluate('(el)=>[el.selectionStart,el.selectionEnd]') == [2,5]
                assert page.locator('#library-grid').evaluate('(el)=>el.inert'), 'Mutations must stay locked'
                field.press('End')
                field.press_sequentially(' Z')
                assert field.input_value() == 'Dragon Ball Z'
                page.evaluate('async()=>{finishCommit(); await syncCycle; delete window.finishCommit;}')
                assert field.evaluate('(el)=>document.activeElement===el')
                assert not page.locator('#library-grid').evaluate('(el)=>el.inert')
                # Apply a remote library update while keeping the search focused.
                page.evaluate('''() => {
                    window.remoteDoc={entries:[{id:'manual:remote',kind:'manga',title:'Remote manga',progress:7,status:'reading',manualTotal:null,muId:null,updated:1}]};
                    window.syncCycle=tsugiSync.runCycle();
                }''')
                page.wait_for_function('typeof window.finishCommit === "function"')
                assert field.evaluate('(el)=>document.activeElement===el')
                assert field.input_value() == 'Dragon Ball Z'
                page.evaluate('async()=>{finishCommit(); await syncCycle; delete window.finishCommit;}')
                assert page.evaluate('TsugiApp.read().entries[0].progress') == 7
            page.evaluate('tsugiSync.lock(true)')
            assert page.locator('main').evaluate('(el)=>el.inert'), 'Account privacy lock must remain'
            page.close()
        browser.close()
        print('PASS: both search fields preserve focus, selection and typing during sync and remote updates, desktop/mobile; account lock preserved.')
finally:
    server.terminate()
    server.wait()
