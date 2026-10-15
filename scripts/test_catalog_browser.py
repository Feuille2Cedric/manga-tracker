import sys,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.test-deps'))
from playwright.sync_api import sync_playwright
server=subprocess.Popen([sys.executable,'-m','http.server','3366','--bind','127.0.0.1','--directory',str(ROOT/'site')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:3366/#discover')
        page.locator('#catalog-grid .card').first.wait_for(timeout=35000)
        page.wait_for_timeout(3000)
        assert page.locator('#catalog-grid .card').count()>=10
        images=page.locator('#catalog-grid img').evaluate_all('(imgs)=>imgs.filter(i=>i.complete&&i.naturalWidth>0).length')
        assert images>=5,images
        page.screenshot(path=str(ROOT/'test-artifacts/catalog-desktop.png'),full_page=True)
        page.set_viewport_size({'width':390,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(ROOT/'test-artifacts/catalog-mobile.png'),full_page=True)
        assert not errors,errors
        print('Live guest catalogue and cover images passed:',images,'covers; desktop and mobile verified')
        browser.close()
finally:server.terminate();server.wait()
