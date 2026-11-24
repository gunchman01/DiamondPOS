import {PENDING_REPAIR_ISSUE,mergeIntakeProblemDraft} from '../src/shared/repairIntake'
import {loadWorkOrder} from '../src/main/server/workorders'
import {readSettings} from '../src/main/server'
import {mechanicWorksheetHtml} from '../src/renderer/src/mechanicWorksheet'
import {workOrderHtml} from '../src/renderer/src/printTemplates'
import assert from 'node:assert/strict'
import path from 'node:path'
import vm from 'node:vm'
import {openDatabase} from '../src/main/server/db'
import {createApp} from '../src/main/server'
import {intakeSettings,saveIntakeSettings,workOrderIntakes} from '../src/main/server/repairIntake'
import {kioskPageHtml} from '../src/main/server/kioskPage'
export async function testRepairIntake(check:(n:string,f:()=>void)=>void,dir:string){
 const file=path.join(dir,'repair-intake.db'),db=openDatabase(file)
 const customer=Number(db.prepare("INSERT INTO customers(first_name,notes,past_due_cents) VALUES ('Intake','PRIVATE STAFF NOTE',12345)").run().lastInsertRowid)
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,category,unit_type,brand,model) VALUES (?,'mower','Zero turn','eXmark','Test')").run(customer).lastInsertRowid)
 const wo=()=>Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id) VALUES (?,?)').run(customer,unit).lastInsertRowid)
 const id=wo(),closed=wo();db.prepare("UPDATE work_orders SET status='closed' WHERE id=?").run(closed)
 db.prepare("INSERT INTO kiosks(name,till_name,token) VALUES ('Repair kiosk','Repair till','repair-token')").run();db.prepare("INSERT INTO kiosks(name,till_name,token) VALUES ('Other kiosk','Other till','other-token')").run()
 const app=createApp(db,{dbFile:file,apiKey:'intake-test',port:0,appVersion:'0.3.73'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${(server.address() as any).port}`
 const call=async(url:string,body?:unknown,staff=true,method=body===undefined?'GET':'POST')=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(staff?{'X-Api-Key':'intake-test'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 const abort=new AbortController(),stream=await fetch(base+'/kiosk/api/events?review=2&intake=1&token=repair-token',{signal:abort.signal}),reader=stream.body!.getReader();await reader.read()
 const start=async(w=id)=>{const r=await call(`/api/workorders/${w}/intake-kiosk`,{tillName:'Repair till'});assert.equal(r.status,201);assert.equal(r.data.repairWorkOrderId,w);return r.data.id as string}
 const form=(session:string,token='repair-token')=>call(`/kiosk/api/session?token=${token}&sessionId=${session}`,undefined,false)
 const submit=(session:string,answers:unknown,token='repair-token')=>call('/kiosk/api/repair-submit',{token,sessionId:session,answers},false)
 try{
  check('starter repair questionnaires distinguish mower, handheld and other equipment',()=>{const s=intakeSettings(db);assert.ok(s.mower.some(q=>q.label.includes('drive')));assert.ok(s.handheld.some(q=>q.label.includes('blowing')));assert.ok(s.other.length);new vm.Script(kioskPageHtml.match(/<script>([\s\S]*?)<\/script>/)![1])})
  const settings=intakeSettings(db);settings.mower=[{id:'starts',label:'Does it start?',type:'yesno',required:true,choices:[]},{id:'symptom',label:'What happens?',type:'choice',required:true,choices:['Stalls','No movement']},{id:'details',label:'More details <script>',type:'text',required:false,choices:[]}]
  const save=await call('/api/repair-intake/settings',settings,true,'PUT'),reload=await call('/api/repair-intake/settings')
  check('staff can save custom question types/required flags and retrieve them without changing other groups',()=>{assert.equal(save.status,200);assert.deepEqual(reload.data,settings)})
  const unauth=await call('/api/repair-intake/settings',undefined,false),denied=await call(`/api/workorders/${id}/intake-kiosk`,{tillName:'Repair till'},false)
  const invalid=await call('/api/repair-intake/settings',{...settings,mower:[{...settings.mower[1],choices:['same','same']}]},true,'PUT')
  check('question settings/dispatch require staff pairing and invalid choices cannot overwrite saved settings',()=>{assert.equal(unauth.status,401);assert.equal(denied.status,401);assert.equal(invalid.status,400);assert.deepEqual(intakeSettings(db),settings)})
  const legacyAbort=new AbortController(),legacy=await fetch(base+'/kiosk/api/events?review=2&token=repair-token',{signal:legacyAbort.signal}),legacyReader=legacy.body!.getReader();await legacyReader.read()
  try{const old=await call(`/api/workorders/${id}/intake-kiosk`,{tillName:'Repair till'});check('older kiosk pages block repair dispatch with reload guidance',()=>{assert.equal(old.status,409);assert.match(old.data.error,/Reload the kiosk browser/)})}finally{legacyAbort.abort();await legacyReader.cancel().catch(()=>{});await new Promise<void>(r=>setTimeout(r,20))}
  const blank=await call('/api/workorders',{customerId:customer,unitId:unit,problem:'',awaitingIntake:true,feeCents:0,by:'Test staff'}),ordinaryBlank=await call('/api/workorders',{customerId:customer,unitId:unit,problem:'',feeCents:0,by:'Test staff'})
  check('kiosk check-in accepts no staff issue description while ordinary check-in still requires one',()=>{assert.equal(blank.status,201);assert.equal(blank.data.problem,PENDING_REPAIR_ISSUE);assert.equal(ordinaryBlank.status,400)})
  const blankSession=await start(blank.data.id);await submit(blankSession,{starts:'No',symptom:'Stalls',details:'Customer supplied the issue'})
  const completedBlank=await call(`/api/workorders/${blank.data.id}`)
  check('answers replace the awaiting-customer placeholder on a ticket checked in without a staff issue',()=>{assert.ok(!completedBlank.data.problem.includes(PENDING_REPAIR_ISSUE));assert.match(completedBlank.data.problem,/Customer supplied the issue/);assert.match(completedBlank.data.problem,/Does it start/);assert.equal(completedBlank.data.intakes.length,1)})
  const session=await start(),data=await form(session),wrong=await form(session,'other-token'),wrongSubmit=await submit(session,{starts:'Yes',symptom:'Stalls'},'other-token')
  check('repair form exposes only the selected unit/question snapshot to its assigned kiosk',()=>{assert.equal(data.data.mode,'repair');assert.equal(data.data.repair.questions.length,3);assert.match(data.data.repair.unitLabel,/eXmark/);assert.equal(wrong.status,409);assert.equal(wrongSubmit.status,409);assert.ok(!JSON.stringify(data.data).includes('PRIVATE STAFF NOTE'));assert.ok(!JSON.stringify(data.data).includes('12345'))})
  const missing=await submit(session,{}),badChoice=await submit(session,{starts:'Yes',symptom:'Unknown'}),extra=await submit(session,{starts:'Yes',symptom:'Stalls',fake:'x'}),signup=await call('/kiosk/api/submit',{token:'repair-token',sessionId:session,firstName:'Fake'},false)
  check('required/choice/unknown answers are validated and repair sessions cannot create a customer through signup',()=>{assert.equal(missing.status,400);assert.equal(badChoice.status,400);assert.equal(extra.status,400);assert.equal(signup.status,400);assert.equal(workOrderIntakes(db,id).length,0)})
  const changed=JSON.parse(JSON.stringify(settings));changed.mower[0].label='New wording';saveIntakeSettings(db,changed)
  const answers={starts:'No',symptom:'No movement',details:'Customer reports <b>noise</b>'},done=await submit(session,answers),retry=await submit(session,answers),staffWo=await call(`/api/workorders/${id}`)
  check('submission snapshots original wording and answers on the work order with exactly-once replay',()=>{assert.equal(done.status,200);assert.equal(retry.status,200);assert.equal(workOrderIntakes(db,id).length,1);assert.equal(staffWo.data.intakes[0].questions[0].label,'Does it start?');assert.deepEqual(staffWo.data.intakes[0].answers,answers);assert.equal(staffWo.data.status,'needs_estimate');assert.equal(staffWo.data.lines.length,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,1)})
  const printed=loadWorkOrder(db,id,readSettings(db).taxRate)!
  check('customer answers populate reported issue and appear escaped on both printed work-order sheets',()=>{assert.match(printed.problem,/Does it start\?/);assert.match(printed.problem,/No movement/);assert.ok(printed.problem.includes('Customer reports <b>noise</b>'));for(const html of [mechanicWorksheetHtml(printed,readSettings(db)),workOrderHtml(printed,readSettings(db),null,null)]){assert.match(html,/No movement/);assert.ok(html.includes('&lt;b&gt;noise&lt;/b&gt;'))}})
  const staleSave=await call(`/api/workorders/${id}`,{problem:'Staff added a note\n'+'x'.repeat(9000),diagnosis:'Keep this diagnosis'},true,'PUT')
  check('saving stale staff notes cannot erase the most recent kiosk answers',()=>{assert.equal(staleSave.status,200);assert.ok(staleSave.data.problem.startsWith('Staff added a note'));assert.ok(staleSave.data.problem.includes('No movement'));assert.equal(staleSave.data.diagnosis,'Keep this diagnosis');assert.ok(staleSave.data.problem.length>9000)})
  check('refresh after kiosk preserves staff drafts and imports answers without duplicating unchanged issue text',()=>{assert.equal(mergeIntakeProblemDraft(PENDING_REPAIR_ISSUE,PENDING_REPAIR_ISSUE,'Answers'),'Answers');assert.equal(mergeIntakeProblemDraft('Draft','Old','Old\n\nAnswers'),'Draft\n\nAnswers');assert.equal(mergeIntakeProblemDraft('Draft','Old','Old'),'Draft');assert.equal(mergeIntakeProblemDraft('Draft\n\nAnswers','Old','Old\n\nAnswers'),'Draft\n\nAnswers')})
  const submittedStatus=await call(`/api/kiosk-sessions/${session}`),after=await form(session)
  check('staff sees submitted status while customer cannot retrieve completed answers',()=>{assert.equal(submittedStatus.data.status,'submitted');assert.equal(after.status,409)})
  const replaced=await start(),replacement=await start(),stale=await submit(replaced,answers)
  await call(`/api/kiosk-sessions/${replacement}/cancel`,{});const cancelled=await submit(replacement,answers)
  check('replaced or cancelled sessions cannot append answers to a ticket',()=>{assert.equal(stale.status,409);assert.equal(cancelled.status,409);assert.equal(workOrderIntakes(db,id).length,1)})
  const staleUnit=await start();db.prepare("UPDATE customer_units SET category='handheld' WHERE id=?").run(unit);const changedUnit=await submit(staleUnit,answers)
  check('changing the equipment category while customer answers rejects a stale questionnaire',()=>assert.equal(changedUnit.status,409))
  const hand=await start(),handForm=await form(hand)
  check('dispatch picks handheld questions from current unit category rather than the previous mower form',()=>{assert.ok(handForm.data.repair.questions.some((q:any)=>q.label.includes('blowing')));assert.ok(!handForm.data.repair.questions.some((q:any)=>q.id==='symptom'))})
  const close=await call(`/api/workorders/${closed}/intake-kiosk`,{tillName:'Repair till'})
  check('closed jobs cannot start another intake and saved responses remain after settings change',()=>{assert.equal(close.status,409);assert.equal(workOrderIntakes(db,id)[0].questions[0].label,'Does it start?')})
  await testRepairScript(check)
 }finally{abort.abort();await reader.cancel().catch(()=>{});await new Promise<void>(r=>server.close(()=>r()));db.close()}
 const reopened=openDatabase(file);try{check('customer intake snapshots survive server/database restart',()=>{assert.equal(workOrderIntakes(reopened,id).length,1);assert.equal(workOrderIntakes(reopened,id)[0].answers.starts,'No')})}finally{reopened.close()}
}
async function testRepairScript(check:(n:string,f:()=>void)=>void){
 const elements=new Map<string,any>(),timers=new Map<number,{fn:()=>void;ms:number}>();let seq=0,events:any;const posts:any[]=[]
 function make(){return {id:'',textContent:'',innerHTML:'',value:'',hidden:true,checked:false,disabled:false,style:{},children:[] as any[],listeners:{} as any,appendChild(child:any){this.children.push(child);if(child.id)elements.set(child.id,child)},addEventListener(kind:string,fn:any){this.listeners[kind]=fn},blur(){},focus(){}}}
 const node=(id:string)=>{if(!elements.has(id))elements.set(id,make());return elements.get(id)}
 const context={document:{getElementById:node,createElement:()=>make(),addEventListener(){},activeElement:null,title:''},localStorage:{getItem:()=> 'script-token',setItem(){},removeItem(){}},EventSource:function(this:any){events=this;this.close=()=>{}},fetch:async(url:string,o:any)=>{if(o.body)posts.push({url,body:JSON.parse(o.body)});return {ok:true,status:200,json:async()=>url.startsWith('/kiosk/api/info')?{storeName:'Test',hasLogo:false}:url.startsWith('/kiosk/api/session')?{mode:'repair',repair:{number:'WO-000001',unitLabel:'Mower',questions:[{id:'issue',label:'Describe <script> damage',type:'text',required:true,choices:[]}]}}:{ok:true}}},setTimeout:(fn:()=>void,ms:number)=>{timers.set(++seq,{fn,ms});return seq},clearTimeout:(id:number)=>timers.delete(id),Date,JSON,encodeURIComponent}
 vm.runInNewContext(kioskPageHtml.match(/<script>([\s\S]*?)<\/script>/)![1],context)
 const flush=async()=>{await new Promise<void>(r=>setImmediate(r));await new Promise<void>(r=>setImmediate(r))};await flush();events.onmessage({data:JSON.stringify({type:'form',sessionId:'repair-session'})});await flush()
 check('actual kiosk script renders repair questions as text without showing the signup form',()=>{assert.equal(node('repair').hidden,false);assert.equal(node('form').hidden,true);assert.equal(node('repairQuestions').children[0].textContent,'Describe <script> damage *');assert.equal(node('repair-q-issue').required,true);assert.ok([...timers.values()].some(t=>t.ms===300000))})
 node('repair-q-issue').value='Existing dent';node('repairForm').listeners.submit({preventDefault(){}});await flush()
 check('actual kiosk script submits answers to repair endpoint and clears displayed unit/questions on completion',()=>{assert.equal(posts.at(-1).url,'/kiosk/api/repair-submit');assert.equal(posts.at(-1).body.answers.issue,'Existing dent');assert.equal(node('repair').hidden,true);assert.equal(node('repairUnit').textContent,'');assert.equal(node('repairQuestions').innerHTML,'')})
}
