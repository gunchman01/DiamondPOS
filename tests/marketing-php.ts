// Optional end-to-end protocol check against real PHP/SQLite, with no SMTP send.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { openDatabase } from '../src/main/server/db'
import { insertCustomer, CUSTOMER_DEFAULTS } from '../src/main/server/customers'
import { saveConsentConfig, syncMarketingConsent, MarketingSuppressed } from '../src/main/server/marketing/consent'
import { prepareDelivery, syncMarketingActivity } from '../src/main/server/marketing/tracking'
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'diamondpos-php-e2e-')),php=process.env.DIAMONDP_TEST_PHP||'php',args=JSON.parse(process.env.DIAMONDP_TEST_PHP_ARGS||'[]') as string[]
 const reservation=net.createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>(r=>reservation.close(()=>r()))
 const privateFile=path.join(dir,'config.php'),webDb=path.join(dir,'web.sqlite'),db=openDatabase(path.join(dir,'pos.db')),key='a'.repeat(64),publicUrl='https://marketing.example.test/index.php'
 const quote=(value:string)=>"'"+value.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'"
 fs.writeFileSync(privateFile,`<?php return ['api_key'=>${quote(key)},'public_url'=>${quote(publicUrl)},'database'=>${quote(webDb)}];`)
 const child=spawn(php,[...args,'-S',`127.0.0.1:${port}`,'-t',path.resolve('extras/cpanel-marketing/public')],{env:{...process.env,DIAMONDP_MARKETING_CONFIG:privateFile},stdio:['ignore','ignore','pipe']});let errors='';child.stderr.on('data',b=>{errors+=b})
 const local=`http://127.0.0.1:${port}/index.php`,fetcher:typeof fetch=(url,init)=>fetch(local+new URL(String(url)).search,init)
 try{
  for(let i=0;i<100;i++){try{await fetch(local);break}catch{await new Promise(r=>setTimeout(r,50))}}
  saveConsentConfig(db,{enabled:true,url:publicUrl,apiKey:key})
  const customer=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Self test',email:'test@example.com',okToEmail:true})
  const campaign=Number(db.prepare("INSERT INTO marketing_campaigns(name,status) VALUES('PHP bridge test','sending')").run().lastInsertRowid)
  const send=Number(db.prepare('INSERT INTO marketing_sends(campaign_id,customer_id,email) VALUES(?,?,?)').run(campaign,customer,'test@example.com').lastInsertRowid)
  const destination='https://morethanmowers.com/service',delivery=await prepareDelivery(db,'test@example.com',send,[destination],fetcher)
  assert.ok(delivery.pixelUrl&&delivery.clickUrls)
  const image=await fetcher(delivery.pixelUrl!);assert.equal(image.headers.get('content-type'),'image/gif');assert.ok((await image.arrayBuffer()).byteLength>0)
  const click=await fetcher(delivery.clickUrls![destination],{redirect:'manual'});assert.equal(click.status,302);assert.equal(click.headers.get('location'),destination)
  await syncMarketingActivity(db,fetcher);await syncMarketingActivity(db,fetcher)
  const rows=db.prepare('SELECT kind,COUNT(*) n FROM marketing_activity WHERE send_id=? GROUP BY kind ORDER BY kind').all(send)
  assert.deepEqual(rows,[{kind:'click',n:1},{kind:'open',n:1}])
  const token=new URL(delivery.unsubscribeUrl).searchParams.get('token')!
  const unsubscribe=await fetch(local,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,confirm:'yes'})});assert.match(await unsubscribe.text(),/You are unsubscribed/)
  await syncMarketingConsent(db,fetcher)
  assert.equal((db.prepare('SELECT ok_to_email FROM customers WHERE id=?').get(customer) as any).ok_to_email,0)
  await assert.rejects(prepareDelivery(db,'test@example.com',send,[destination],fetcher),MarketingSuppressed)
  console.log('PASS real PHP ↔ POS SQLite: prepare links, record image/click, synchronize exact recipient once, confirm unsubscribe, synchronize consent, block future send')
 }catch(e){console.error(errors);throw e}finally{child.kill();await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once('exit',()=>r())});db.close();fs.rmSync(dir,{recursive:true,force:true})}
}
void main().catch(e=>{console.error(e);process.exitCode=1})
