"""Real PHP/SQLite HTTP test. Set DIAMONDP_TEST_PHP and optional DIAMONDP_TEST_PHP_ARGS (JSON array)."""
import json, os, pathlib, socket, subprocess, tempfile, time, urllib.request, urllib.error
php=os.environ.get('DIAMONDP_TEST_PHP','php')
args=json.loads(os.environ.get('DIAMONDP_TEST_PHP_ARGS','[]'))
source=pathlib.Path(__file__).resolve().parents[2]/'extras/cpanel-marketing/public'
key='a'*64
with tempfile.TemporaryDirectory(prefix='diamondpos-consent-') as tmp:
    root=pathlib.Path(tmp); config=root/'config.php'; db=root/'consent.sqlite'
    config.write_text("<?php return "+"['api_key'=>'"+key+"','public_url'=>'https://marketing.example.test/index.php','database'=>'"+str(db)+"','store_name'=>'Test shop'];")
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
        try:
            for _ in range(100):
                try: request();break
                except (OSError,urllib.error.URLError):time.sleep(.05)
            assert request('pull',{'cursor':0},False)[0]==401
            assert request('pull',{'cursor':-1})[0]==400
            prepared=api('prepare',{'email':'Person@Example.com'});assert not prepared['suppressed']
            token=prepared['unsubscribeUrl'].split('token=')[1];assert len(token)==64
            status,page,headers=request(query='?token='+token,auth=False)
            assert status==200 and 'Confirm below' in page and 'person@example.com' not in page
            assert headers['Cache-Control']=='no-store' and 'no-referrer' in headers['Referrer-Policy']
            assert api('pull',{'cursor':0})['events']==[] # Link scanners must not unsubscribe on GET.
            assert not api('prepare',{'email':'person@example.com'})['suppressed']
            status,page,_=request(form='token='+token+'&confirm=yes',auth=False)
            assert status==200 and 'You are unsubscribed' in page
            assert api('prepare',{'email':' PERSON@example.com '})['suppressed']
            request(form='token='+token+'&confirm=yes',auth=False)
            api('suppress',{'email':'person@example.com'})
            feed=api('pull',{'cursor':0});assert len(feed['events'])==1
            event=feed['events'][0];assert event['email']=='person@example.com'
            api('ack',{'cursor':event['id'],'clientId':'12345678-1234-1234-1234-123456789abc'})
            assert api('pull',{'cursor':0})['events']==feed['events'] # ACK must not destroy history.
            assert request('ack',{'cursor':9999,'clientId':'12345678-1234-1234-1234-123456789abc'})[0]==400
            assert api('pull',{'cursor':event['id']})['events']==[]
            assert 'invalid' in request(query='?token=bogus',auth=False)[1]
            assert db.exists() and db.stat().st_mode&0o777==0o600
            print('PASS PHP service: authorization, link confirmation, scanner-safe GET, suppression, duplicate POST, ACK/replay, invalid requests, private SQLite permissions')
        finally:
            proc.terminate();proc.wait(timeout=5)
