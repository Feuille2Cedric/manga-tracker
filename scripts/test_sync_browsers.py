"""Real Supabase sync between isolated browser profiles using a disposable user."""
import json,secrets,subprocess,sys,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.test-deps'))
from playwright.sync_api import sync_playwright
CLI=str(ROOT.parent/'.tmp-cine-deploy/cli/supabase.exe');BASE='https://kzdvpbbjvjbxnsamdnao.supabase.co'
keys=json.loads(subprocess.run([CLI,'projects','api-keys','--project-ref','kzdvpbbjvjbxnsamdnao','--output','json'],capture_output=True,text=True,check=True).stdout)
service=next(k['api_key'] for k in keys if k['name']=='service_role')
def admin(path,body=None,method=None):
    req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body else None,headers={'apikey':service,'Authorization':'Bearer '+service,'Content-Type':'application/json'},method=method)
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
user=None;server=None
try:
    email='tsugi-browser-'+secrets.token_hex(8)+'@example.com';password=secrets.token_urlsafe(25)
    user=admin('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True})
    server=subprocess.Popen([sys.executable,'-m','http.server','3370','--bind','127.0.0.1','--directory',str(ROOT/'site')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        pages=[]
        for i in range(2):
            context=browser.new_context();page=context.new_page();pages.append(page)
            page.goto('http://127.0.0.1:3370/')
            page.wait_for_function('window.tsugiSync?.client && window.tsugiSync?.db')
            page.locator('#sync-account').click();page.locator('#sync-email').fill(email);page.locator('#auth-password').fill(password);page.locator('#auth-submit').click()
            page.wait_for_function("tsugiSync.user && document.querySelector('#sync-status').textContent.includes('Synchronisé')",timeout=45000)
            page.locator('.sync-close').click()
        a,b=pages
        a.locator('nav [data-view=discover]').click()
        a.locator('#manual').click();a.locator('#manual-form [name=title]').fill('Cross browser manga');a.locator('#manual-form [name=total]').fill('50');a.locator('#manual-form button').click()
        a.wait_for_function("!tsugiSync.busy && tsugiSync.meta.base?.entries.length===1",timeout=25000)
        b.wait_for_function('TsugiApp.read().entries.length===1',timeout=30000)
        b.locator('#library-grid .card-title').click();b.locator('[name=progress]').fill('12');b.locator('[name=readingUrl]').fill('https://example.com/read');b.locator('#progress-form button.primary').click()
        b.wait_for_function('tsugiSync.meta.base?.entries[0]?.progress===12',timeout=25000)
        a.wait_for_function('TsugiApp.read().entries[0]?.progress===12',timeout=30000)
        assert a.evaluate('TsugiApp.read().entries[0].readingUrl')=='https://example.com/read'
        b.reload();b.wait_for_function("tsugiSync?.user && tsugiSync.meta.base?.entries[0]?.progress===12",timeout=30000)
        print('PASS: same-account login, manga A to B, chapter and link B to A, session after reload.')
        # A request that never replies must not leave sync permanently busy.
        stalled=[]
        a.route('**/rest/v1/rpc/personal_app_save',lambda route:stalled.append(route))
        a.locator('[data-increment]').click()
        a.wait_for_function('tsugiSync.busy',timeout=5000)
        a.wait_for_function("!tsugiSync.busy && document.querySelector('#sync-status').textContent.includes('attente')",timeout=22000)
        assert a.evaluate('TsugiApp.read().entries[0].progress')==13
        a.unroute('**/rest/v1/rpc/personal_app_save')
        for route in stalled:route.abort()
        a.evaluate("window.dispatchEvent(new Event('online'))")
        a.wait_for_function('tsugiSync.meta.base?.entries[0]?.progress===13',timeout=20000)
        b.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        b.wait_for_function('TsugiApp.read().entries[0]?.progress===13',timeout=20000)
        print('PASS: stalled upload times out, keeps local progress, retries and reaches other browser.')
        browser.close()
finally:
    if server:server.terminate();server.wait()
    if user:admin('/auth/v1/admin/users/'+user['id'],method='DELETE');print('Temporary account removed.')
