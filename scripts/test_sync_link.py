"""A slow cloud save after adding a reading link must not block interaction."""
import sys, subprocess, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.test-deps'))
from playwright.sync_api import sync_playwright
server=subprocess.Popen([sys.executable,'-m','http.server','3369','--bind','127.0.0.1','--directory',str(ROOT/'site')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page()
        page.on('pageerror',lambda e:print('Browser error:',str(e)))
        page.goto('http://127.0.0.1:3369/')
        page.wait_for_function('window.tsugiSync?.client && window.tsugiSync?.db')
        page.evaluate("""async()=>{
            const s=tsugiSync;clearInterval(s.interval);
            const user={id:'link-test',email:'link@example.test'};s.user=user;
            s.client={auth:{getSession:async()=>({data:{session:{user,access_token:'test'}}})}};
            window.cloud={entries:[{id:'manual:test',kind:'manga',title:'Test manga',progress:1,status:'reading',manualTotal:20,muId:null,updated:1}]};
            TsugiApp.apply(structuredClone(cloud));
            await s.metadata({owner:user.id,revision:1,base:structuredClone(cloud)});
            s.remote=async()=>({revision:1,document:structuredClone(cloud)});
            window.supabase.createClient=()=>({rpc:async(name,args)=>{
                window.sent=structuredClone(args.p_document);
                await new Promise(resolve=>window.finishSave=resolve);
                window.cloud=structuredClone(sent);return {data:{revision:2}};
            }});
        }""")
        page.locator('#library-grid .card-title').click()
        page.locator('[name=readingUrl]').fill('https://example.com/read')
        page.locator('#progress-form button.primary').click()
        page.wait_for_function('typeof finishSave === "function"')
        assert not page.locator('#library-grid').evaluate('(e)=>e.inert')
        page.locator('#library-grid .card-title').click(timeout=2000)
        page.locator('[name=progress]').fill('7')
        page.locator('#progress-form button.primary').click()
        page.evaluate('finishSave()')
        page.wait_for_function('!tsugiSync.busy')
        assert page.evaluate("entryFor('manual:test').progress")==7
        assert page.evaluate("entryFor('manual:test').readingUrl")=='https://example.com/read'
        page.evaluate("""async()=>{
            clearTimeout(tsugiSync.timer);
            window.supabase.createClient=()=>({rpc:async(name,args)=>{cloud=structuredClone(args.p_document);return {data:{revision:3}};}});
            await tsugiSync.runCycle();
        }""")
        assert page.evaluate('cloud.entries[0].progress')==7
        assert page.evaluate('cloud.entries[0].readingUrl')=='https://example.com/read'
        # A stale in-memory view must be reconciled even if storage equals cloud.
        page.evaluate("library.entries[0].progress=2;render()")
        page.evaluate('async()=>{await tsugiSync.runCycle();}')
        assert page.evaluate("entryFor('manual:test').progress")==7
        assert '1 titres' in page.locator('#sync-status').text_content()
        page.locator('#library-grid .card-title').click(timeout=2000)
        assert page.locator('#open-reading-link').get_attribute('href')=='https://example.com/read'
        page.locator('[name=progress]').fill('9')
        page.evaluate("cloud.entries[0].readingUrl='https://example.com/new';cloud.entries[0].updated=Date.now()+10")
        page.evaluate('async()=>{await tsugiSync.runCycle();}')
        assert page.locator('[name=progress]').input_value()=='9'
        assert page.evaluate("entryFor('manual:test').readingUrl")=='https://example.com/new'
        page.locator('#progress-form button.primary').click()
        assert page.evaluate("entryFor('manual:test').progress")==9
        assert page.evaluate("entryFor('manual:test').readingUrl")=='https://example.com/new'
        page.evaluate('async()=>{await tsugiSync.runCycle();}')
        assert page.evaluate('cloud.entries[0].progress')==9
        browser.close()
        print('PASS: slow link save keeps page clickable; concurrent progress and link survive next sync.')
finally:
    server.terminate();server.wait()
