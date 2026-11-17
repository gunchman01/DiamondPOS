"""Real PHP/SQLite HTTP test. Set DIAMONDP_TEST_PHP and optional DIAMONDP_TEST_PHP_ARGS (JSON array)."""
import json, os, pathlib, socket, subprocess, tempfile, time, urllib.request, urllib.error, urllib.parse, sqlite3, hashlib
php=os.environ.get('DIAMONDP_TEST_PHP','php')
args=json.loads(os.environ.get('DIAMONDP_TEST_PHP_ARGS','[]'))
source=pathlib.Path(__file__).resolve().parents[2]/'extras/cpanel-marketing/public'
key='a'*64
with tempfile.TemporaryDirectory(prefix='diamondpos-consent-') as tmp:
    root=pathlib.Path(tmp); config=root/'config.php'; db=root/'consent.sqlite'
    config.write_text("<?php return "+"['api_key'=>'"+key+"','public_url'=>'https://marketing.example.test/index.php','database'=>'"+str(db)+"','store_name'=>'Test shop'];")
    # Existing v0.3.44 private data must survive the public service upgrade.
    legacy_token='d'*64
    with sqlite3.connect(db) as old:
        old.execute('CREATE TABLE tokens(hash TEXT PRIMARY KEY,email TEXT NOT NULL,created_at TEXT NOT NULL)')
        old.execute('INSERT INTO tokens VALUES(?,?,?)',(hashlib.sha256(legacy_token.encode()).hexdigest(),'legacy@example.com','2026-11-17T00:00:00Z'))
    sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
    base=f'http://127.0.0.1:{port}/index.php'
    env=dict(os.environ,DIAMONDP_MARKETING_CONFIG=str(config))
    with open(root/'php.log','w+') as log:
        proc=subprocess.Popen([php,*args,'-S',f'127.0.0.1:{port}','-t',str(source)],env=env,stdout=log,stderr=log)
        def request(action='',body=None,auth=True,form=None,query=''):
            url=base+('?action='+action if action else query)
            headers={}
            if auth: headers['X-DiamondPOS-Key']=key
            if form is not None: data=form.encode();headers['Content-Type']='application/x-www-form-urlencoded'
            elif body is not None: data=json.dumps(body).encode();headers['Content-Type']='application/json'
            else: data=None
            try:
                with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers),timeout=3) as r:return r.status,r.read().decode(),r.headers
            except urllib.error.HTTPError as e:return e.code,e.read().decode(),e.headers
        def api(action,body):
            status,text,_=request(action,body);assert status==200,(status,text);return json.loads(text)
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):return None
        opener=urllib.request.build_opener(NoRedirect)
        def visit(url,method='GET',agent='Test customer browser'):
            local=base+'?'+urllib.parse.urlsplit(url).query
            try:
                with opener.open(urllib.request.Request(local,method=method,headers={'User-Agent':agent}),timeout=3) as response:return response.status,response.read(),response.headers
            except urllib.error.HTTPError as e:return e.code,e.read(),e.headers
        try:
            for _ in range(100):
                try: request();break
                except (OSError,urllib.error.URLError):time.sleep(.05)
            assert 'Confirm below' in request(query='?token='+legacy_token,auth=False)[1]
            assert request('pull',{'cursor':0},False)[0]==401
            assert request('activity',{'cursor':0},False)[0]==401
            delivery='e'*64;destination='https://morethanmowers.com/service?unit=mower&offer=fall'
            tracked=api('prepareTracking',{'email':'track@example.com','deliveryKey':delivery,'links':[destination]})
            assert tracked['version']==1 and not tracked['suppressed']
            pixel=tracked['pixelUrl'];click=tracked['clickUrls'][destination]
            assert 'track@example.com' not in pixel and len(urllib.parse.parse_qs(urllib.parse.urlsplit(pixel).query)['token'][0])==64
            assert request('prepareTracking',{'email':'different@example.com','deliveryKey':delivery,'links':[]})[0]==400
            assert request('prepareTracking',{'email':'track@example.com','deliveryKey':delivery,'links':['javascript:alert(1)']})[0]==400
            assert request('prepareTracking',{'email':'track@example.com','deliveryKey':delivery,'links':['https://user:secret@example.com/']})[0]==400
            assert visit(pixel,method='HEAD')[0]==200
            assert visit(pixel,agent='Link preview bot')[0]==200
            assert api('activity',{'cursor':0})['events']==[]
            status,image,headers=visit(pixel);assert status==200 and image.startswith(b'GIF89a') and headers['Content-Type']=='image/gif'
            assert visit(pixel)[0]==200 # Reload within one minute is coalesced.
            status,_,headers=visit(click,method='HEAD');assert status==302 and headers['Location']==destination
            before=api('activity',{'cursor':0});assert len(before['events'])==1 and before['events'][0]['kind']=='open'
            status,_,headers=visit(click+'&url=https://attacker.example/');assert status==302 and headers['Location']==destination
            assert visit(click)[0]==302
            activity=api('activity',{'cursor':0});assert len(activity['events'])==2
            assert activity['events'][1]['kind']=='click' and activity['events'][1]['url']==destination
            assert all(e['deliveryKey']==delivery and 'email' not in e and 'ip' not in e and 'userAgent' not in e for e in activity['events'])
            assert api('activity',{'cursor':activity['events'][-1]['id']})['events']==[]
            assert request('activity',{'cursor':9999})[0]==409
            assert visit(base+'?action=click&token='+'f'*64)[0]==404
            api('suppress',{'email':'track@example.com'})
            assert api('prepareTracking',{'email':'track@example.com','deliveryKey':delivery,'links':[]})['suppressed']
            assert visit(click)[0]==302 # Link remains usable after opting out.
            assert len(api('activity',{'cursor':0})['events'])==2

            assert request('pull',{'cursor':-1})[0]==400
            prepared=api('prepare',{'email':'Person@Example.com'});assert not prepared['suppressed']
            token=prepared['unsubscribeUrl'].split('token=')[1];assert len(token)==64
            status,page,headers=request(query='?token='+token,auth=False)
            assert status==200 and 'Confirm below' in page and 'person@example.com' not in page
            assert headers['Cache-Control']=='no-store' and 'no-referrer' in headers['Referrer-Policy']
            assert not any(e['email']=='person@example.com' for e in api('pull',{'cursor':0})['events']) # Link scanners must not unsubscribe on GET.
            assert not api('prepare',{'email':'person@example.com'})['suppressed']
            status,page,_=request(form='token='+token+'&confirm=yes',auth=False)
            assert status==200 and 'You are unsubscribed' in page
            assert api('prepare',{'email':' PERSON@example.com '})['suppressed']
            request(form='token='+token+'&confirm=yes',auth=False)
            api('suppress',{'email':'person@example.com'})
            feed=api('pull',{'cursor':0});assert len(feed['events'])==2
            event=feed['events'][-1];assert event['email']=='person@example.com'
            api('ack',{'cursor':event['id'],'clientId':'12345678-1234-1234-1234-123456789abc'})
            assert api('pull',{'cursor':0})['events']==feed['events'] # ACK must not destroy history.
            assert request('ack',{'cursor':9999,'clientId':'12345678-1234-1234-1234-123456789abc'})[0]==400
            assert api('pull',{'cursor':event['id']})['events']==[]
            assert 'invalid' in request(query='?token=bogus',auth=False)[1]
            assert db.exists() and db.stat().st_mode&0o777==0o600
            print('PASS PHP service: legacy token upgrade, pixel GIF, secure redirects, bot/HEAD filtering, reload deduplication, activity cursor/replay, no new tracking after suppression; authorization, link confirmation, scanner-safe GET, suppression, duplicate POST, ACK/replay, invalid requests, private SQLite permissions')
        finally:
            proc.terminate();proc.wait(timeout=5)
