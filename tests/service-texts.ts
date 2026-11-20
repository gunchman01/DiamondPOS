import {getCustomer,validateCustomer,updateCustomer} from '../src/main/server/customers'
import assert from 'node:assert/strict'
import path from 'node:path'
import {openDatabase} from '../src/main/server/db'
import {createApp,readSettings} from '../src/main/server'
import {saveTextSettings,textSettingsView,sendServiceText} from '../src/main/server/serviceNotifications'
import {saveApprovalConfig,testApprovalConnection,estimateInfo} from '../src/main/server/approvals'
export async function testServiceTexts(check:(name:string,fn:()=>void)=>void,dir:string){
 const file=path.join(dir,'service-texts.db'),db=openDatabase(file),originalFetch=globalThis.fetch
 const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name,mobile,email) VALUES ('Service','Customer','9185551234','customer@example.com')").run().lastInsertRowid)
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Chainsaw')").run(customer).lastInsertRowid)
 const ticket=(status='ready_pickup')=>Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id,status) VALUES (?,?,?)').run(customer,unit,status).lastInsertRowid)
 const app=createApp(db,{dbFile:file,apiKey:'service-text-test',port:0,appVersion:'pending'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${(server.address() as any).port}`
 const call=async(url:string,body?:any,method=body===undefined?'GET':'POST')=>{const r=await originalFetch(base+url,{method,headers:{'X-Api-Key':'service-text-test','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json() as any}}
 let sent:any[]=[],mode='accepted',published:any[]=[]
 const remote:typeof fetch=async(url,options)=>{
  if(String(url).includes('api.mobile-text-alerts.com')){sent.push(JSON.parse(String(options!.body)));if(mode==='timeout')throw Error('network secret');return new Response(JSON.stringify({data:{messageId:'test-provider-id',totalSent:mode==='zero'?0:1}}),{status:mode==='reject'?400:200})}
  const body=JSON.parse(String(options!.body));published.push(body);return new Response(JSON.stringify({serviceId:'test-service',protocol:1}),{status:200})
 }
 try{
  check('text settings require credentials and callback; views never expose saved key',()=>{
   assert.throws(()=>saveTextSettings(db,{enabled:true}));saveTextSettings(db,{enabled:true,apiKey:'private-key',callbackNumber:'918-341-3336'});assert.equal(textSettingsView(db).hasKey,true);assert.ok(!JSON.stringify(textSettingsView(db)).includes('private-key'));saveTextSettings(db,{enabled:true,callbackNumber:'918-341-3336'});assert.equal(textSettingsView(db).hasKey,true)
  })
  const settingsBefore=await call('/api/workorders/text-settings'),settingsSaved=await call('/api/workorders/text-settings',{enabled:true,apiKey:'api-test-key',callbackNumber:'918-341-3336'},'PUT'),settingsAfter=await call('/api/workorders/text-settings')
  check('text settings GET and PUT resolve as settings rather than work-order IDs and hide the key',()=>{assert.equal(settingsBefore.status,200);assert.equal(settingsSaved.status,200);assert.equal(settingsAfter.status,200);assert.equal(settingsAfter.data.hasKey,true);assert.equal(settingsAfter.data.callbackNumber,'918-341-3336');assert.ok(!JSON.stringify(settingsAfter.data).includes('api-test-key'))})
  globalThis.fetch=remote
  const id=ticket(),request={requestId:'ready-notice-request-001',email:false,text:true,permission:true,by:'Test'}
  const beforePermission=await call(`/api/workorders/${id}/notify`,{...request,requestId:'permission-required-request-001'})
  check('existing customers default to text disabled and a forged per-send checkbox cannot bypass it',()=>{assert.equal(getCustomer(db,customer)?.okToServiceText,false);assert.equal(beforePermission.status,400);assert.equal(sent.length,0)})
  const current=getCustomer(db,customer)!;updateCustomer(db,customer,validateCustomer({okToServiceText:true},current))
  check('customer service-text checkbox persists independently from marketing email permission',()=>{assert.equal(getCustomer(db,customer)?.okToServiceText,true);assert.equal(getCustomer(db,customer)?.okToEmail,false)})
  const first=await call(`/api/workorders/${id}/notify`,request),again=await call(`/api/workorders/${id}/notify`,request)
  check('pickup text targets one normalized customer number, identifies unit and states replies unmonitored',()=>{assert.equal(first.status,200);assert.equal(first.data.results.text.status,'accepted');assert.equal(sent.length,1);assert.deepEqual(sent[0].subscribers,['+19185551234']);assert.ok(sent[0].message.includes('Chainsaw'));assert.ok(sent[0].message.includes('Replies are not monitored'));assert.ok(sent[0].message.includes('Reply STOP'));assert.equal(sent[0].allSubscribers,undefined)})
  check('replaying notification request does not send a duplicate paid text',()=>{assert.equal(again.status,200);assert.equal(sent.length,1)})
  const changed=await call(`/api/workorders/${id}/notify`,{...request,email:true}),permission=await call(`/api/workorders/${id}/notify`,{...request,requestId:'no-permission-request-001',permission:false}),stage=await call(`/api/workorders/${ticket('on_bench')}/notify`,{...request,requestId:'bench-notice-request-001'})
  check('notification guards reject reused choices, missing service-text permission and unsupported stages',()=>{assert.equal(changed.status,409);assert.equal(permission.status,400);assert.equal(stage.status,400);assert.equal(sent.length,1)})
  mode='timeout';const uncertain=await call(`/api/workorders/${id}/notify`,{...request,requestId:'uncertain-notice-request-001'});await call(`/api/workorders/${id}/notify`,{...request,requestId:'uncertain-notice-request-001'})
  check('ambiguous text result is saved as unknown and never automatically resent',()=>{assert.equal(uncertain.data.results.text.status,'unknown');assert.equal(sent.length,2);assert.ok(!JSON.stringify(uncertain.data).includes('private-key'))})
  mode='zero';const zero=await sendServiceText({enabled:true,apiKey:'test',callbackNumber:'test'},'9185551234','Test','zero',remote)
  check('HTTP success without one accepted recipient is not claimed as sent or delivered',()=>assert.equal(zero.status,'unknown'))
  saveApprovalConfig(db,{key:'a'.repeat(64)});await testApprovalConnection(db,async()=>({protocol:1,serviceId:'test-service'}));saveApprovalConfig(db,{enabled:true})
  mode='accepted';const estimateId=ticket('needs_estimate'),estimate=await call(`/api/workorders/${estimateId}/notify`,{...request,requestId:'estimate-text-request-001',estimate:true})
  check('text-only estimate publishes an actionable approval link, starts follow-up and does not claim an email',()=>{assert.equal(estimate.status,200);assert.equal(estimate.data.results.text.status,'accepted');assert.equal(estimate.data.workOrder.status,'waiting_customer');assert.equal(estimate.data.workOrder.estimate?.state,'pending');assert.ok(sent.at(-1).message.includes('index.php?token='));assert.equal(estimate.data.workOrder.lastEmailedAt,null)})
  mode='reject';const rejectId=ticket('needs_estimate'),rejected=await call(`/api/workorders/${rejectId}/notify`,{...request,requestId:'estimate-reject-request-001',estimate:true})
  check('rejected estimate text does not start customer-wait timer and records failure',()=>{assert.equal(rejected.data.results.text.status,'failed');assert.equal(rejected.data.workOrder.status,'needs_estimate');assert.equal(rejected.data.workOrder.estimate?.state,'failed')})
  mode='accepted';const mixedId=ticket('needs_estimate'),mixed=await call(`/api/workorders/${mixedId}/notify`,{...request,requestId:'estimate-both-request-001',estimate:true,email:true})
  check('failure on one channel remains visible without cancelling the successful text approval link',()=>{assert.equal(mixed.data.results.email.status,'failed');assert.equal(mixed.data.results.text.status,'accepted');assert.equal(mixed.data.workOrder.estimate?.state,'pending')})
  const existing=getCustomer(db,customer)!;updateCustomer(db,customer,validateCustomer({mobile:'9185552222'},existing))
  const numberChanged=await call(`/api/workorders/${id}/notify`,{...request,requestId:'changed-phone-request-001'})
  check('changing the text destination without renewed permission disables service texts',()=>{assert.equal(getCustomer(db,customer)?.okToServiceText,false);assert.equal(numberChanged.status,400)})
 }finally{globalThis.fetch=originalFetch;await new Promise<void>(r=>server.close(()=>r()));db.close()}
}
