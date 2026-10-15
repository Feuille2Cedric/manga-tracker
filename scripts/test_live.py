"""Live checks with disposable confirmed accounts. No real user data is read or changed."""
import json, os, secrets, subprocess, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CLI=str(ROOT.parent/'.tmp-cine-deploy/cli/supabase.exe')
BASE='https://kzdvpbbjvjbxnsamdnao.supabase.co'
keys=json.loads(subprocess.run([CLI,'projects','api-keys','--project-ref','kzdvpbbjvjbxnsamdnao','--output','json'],capture_output=True,text=True,check=True).stdout)
anon=next(k['api_key'] for k in keys if k['name']=='anon')
service=next(k['api_key'] for k in keys if k['name']=='service_role')
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def request(path,body=None,token=None,method=None,admin=False):
    req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers={'apikey':service if admin else anon,'Authorization':'Bearer '+(token or (service if admin else anon)),'Content-Type':'application/json'},method=method)
    try:
        with opener.open(req,timeout=70) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:
        return e.code,json.load(e)
users=[]
try:
    status,result=request('/functions/v1/manga-catalog',{'action':'get','id':'manga:111'})
    assert status==401,(status,result)
    print('Anonymous writes denied')
    sessions=[]
    for i in range(2):
        email='tsugi-test-'+secrets.token_hex(8)+'@example.com';password=secrets.token_urlsafe(26)
        status,user=request('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True},admin=True)
        assert status in (200,201),(status,user)
        users.append(user['id'])
        status,session=request('/auth/v1/token?grant_type=password',{'email':email,'password':password})
        assert status==200,(status,session)
        sessions.append(session['access_token'])
    doc={'entries':[{'id':'manga:111','kind':'manga','title':'Dragon Ball','progress':15,'status':'reading','manualTotal':None,'muId':None,'updated':1}]}
    status,saved=request('/rest/v1/rpc/personal_app_save',{'p_app':'tsugi','p_revision':0,'p_document':doc},sessions[0]);assert status==200 and saved['revision']==1,(status,saved)
    status,rows=request('/rest/v1/personal_app_state?app=eq.tsugi&select=revision,document',token=sessions[0]);assert len(rows)==1 and rows[0]['document']==doc
    status,rows=request('/rest/v1/personal_app_state?app=eq.tsugi&select=revision,document',token=sessions[1]);assert rows==[]
    status,conflict=request('/rest/v1/rpc/personal_app_save',{'p_app':'tsugi','p_revision':0,'p_document':doc},sessions[0]);assert conflict.get('conflict')
    print('Private save, owner isolation and stale revision protection passed')
    status,denied=request('/functions/v1/manga-catalog',{'action':'refresh'},sessions[0]);assert status==403
    print('Scheduler denied to normal users')
    status,result=request('/functions/v1/manga-catalog',{'action':'search','kind':'manga','query':'Dragon Ball','page':1},sessions[0])
    assert status==200 and any(d['id']=='manga:111' for d in result['data']),(status,result)
    print('Live Kitsu search passed:',len(result['data']),'results')
    status,result=request('/functions/v1/manga-catalog',{'action':'get','id':'manga:111'},sessions[0]);assert status==200 and result['data']['total']>=519,(status,result)
    print('Dragon Ball chapters verified, adaptations:',len(result['data']['relations']))
    (ROOT/'test-artifacts').mkdir(exist_ok=True)
    (ROOT/'test-artifacts/dragon-ball.json').write_text(json.dumps(result['data']),encoding='utf-8')
    status,result=request('/functions/v1/manga-catalog',{'action':'muSearch','query':'One Piece'},sessions[0]);assert status==200 and result['data'],(status,result)
    match=next((d for d in result['data'] if d['title'].lower()=='one piece'),result['data'][0])
    status,result=request('/functions/v1/manga-catalog',{'action':'get','id':match['id']},sessions[0]);assert status==200,(status,result)
    print('MangaUpdates live:',result['data']['title'],'latest',result['data']['latest'])
    status,result=request('/functions/v1/manga-catalog',{'action':'get','id':'manga:38'},sessions[0]);assert status==200,(status,result)
    assert result['data'].get('latest',0)>1000 and result['data'].get('releaseId'),result
    print('One Piece automatic release association passed')
finally:
    for user in users:
        status,_=request('/auth/v1/admin/users/'+user,method='DELETE',admin=True)
        print('Temporary account cleaned:',status==200)
