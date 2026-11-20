import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { openDatabase } from '../src/main/server/db'
import { createApp } from '../src/main/server'
import { createBackupManager, backupSettings, createVerifiedBackup, getBackupManager } from '../src/main/server/backup'
import { validateBackupSettings,backupFrequency,backupOverdue } from '../src/shared/backups'
import { backupStatus } from '../src/main/server/operations'
type Check = (name: string, fn: () => void) => void
export async function testBackupSettings(check: Check, dir: string) {
  check('Home backup labels use saved intervals and never invent a 15-minute fallback',()=>{assert.equal(backupFrequency(240),'Every 4 hours');assert.equal(backupFrequency(1440),'Every 24 hours');assert.equal(backupFrequency(30),'Every 30 minutes');assert.equal(backupFrequency(60),'Every hour');assert.equal(backupFrequency(undefined),'Schedule not available')})
  check('Home overdue status respects the actual next run, long intervals, in-progress and stopped schedulers',()=>{const time='2026-11-20T12:00:00Z',base:any={lastVerifiedAt:'2026-11-20T08:00:00Z',intervalMinutes:1440,schedulerRunning:true,running:false,nextBackupAt:'2026-11-21T08:00:00Z'};assert.equal(backupOverdue(base,time),false);assert.equal(backupOverdue({...base,nextBackupAt:'2026-11-20T11:50:00Z'},time),true);assert.equal(backupOverdue({...base,nextBackupAt:null,schedulerRunning:false},time),false);assert.equal(backupOverdue({...base,nextBackupAt:'2026-11-20T11:50:00Z',running:true},time),false)})
  const folder=path.join(dir,'backup-settings'), file=path.join(folder,'store.db'), directory=path.join(folder,'backups')
  const db=openDatabase(file)
  const manager=createBackupManager(db,directory)
  check('backup defaults use hourly snapshots and 12 retained copies; invalid settings are rejected',()=>{
    assert.deepEqual(backupSettings(db),{intervalMinutes:60,keepCount:12})
    for(const value of [null,{}, {intervalMinutes:1,keepCount:12},{intervalMinutes:60,keepCount:0},{intervalMinutes:60,keepCount:366},{intervalMinutes:60,keepCount:1.5}]) assert.throws(()=>validateBackupSettings(value))
  })
  fs.mkdirSync(directory,{recursive:true})
  const base=await createVerifiedBackup(db,path.join(folder,'seed'))
  for(let day=1;day<=16;day++)fs.copyFileSync(base,path.join(directory,`store-auto-2020-01-${String(day).padStart(2,'0')}T00-00-00-000Z.db`))
  const protectedNames=['store-before-v28-2020-01-01T00-00-00-000Z.db','my-manual-copy.db','store-auto-not-a-generated-name.db','store-auto-2020-01-01T00-00-00-000Z.db.partial']
  for(const name of protectedNames)fs.copyFileSync(base,path.join(directory,name))
  fs.mkdirSync(path.join(directory,'store-auto-2020-01-01T00-00-00-001Z.db'))
  manager.start()
  const run1=manager.run(),run2=manager.run()
  check('scheduled and manual requests join one in-flight backup',()=>assert.equal(run1,run2))
  await run1
  let status=await manager.overview()
  check('verified backup prunes to 12 recent files and preserves pre-migration/unknown/partial files and directories',()=>{
    assert.equal(status.managedCount,12);assert.equal(status.protectedCount,4);assert.equal(status.fileCount,16)
    assert.ok(status.totalBytes>0);assert.ok(status.status.lastVerifiedAt);assert.equal(status.status.running,false)
    assert.equal(status.cleanupError,null);assert.ok(status.lastFile&&fs.existsSync(status.lastFile))
    for(const name of protectedNames)assert.ok(fs.existsSync(path.join(directory,name)))
    assert.ok(fs.statSync(path.join(directory,'store-auto-2020-01-01T00-00-00-001Z.db')).isDirectory())
    assert.ok(!fs.existsSync(path.join(directory,'store-auto-2020-01-01T00-00-00-000Z.db')))
  })
  check('frequency changes persist and immediately reschedule without deleting files',()=>{
    manager.save({intervalMinutes:240,keepCount:3})
    assert.deepEqual(backupSettings(db),{intervalMinutes:240,keepCount:3})
  })
  status=await manager.overview()
  check('next-run time follows saved interval and retention waits for a new verified backup',()=>{
    const delay=Date.parse(status.nextBackupAt!)-Date.now();assert.ok(delay>239*60000&&delay<=240*60000)
    assert.equal(status.managedCount,12)
  })
  await manager.run();status=await manager.overview()
  check('Back Up Now applies changed retention after successful verification',()=>assert.equal(status.managedCount,3))
  const originalUnlink = fs.promises.unlink
  try {
    fs.promises.unlink = async () => { throw new Error('Simulated cleanup permission error') }
    manager.save({intervalMinutes:60,keepCount:1})
    await manager.run()
    const warning = await manager.overview()
    check('cleanup failure reports a separate warning without marking a verified snapshot as failed',()=>{
      assert.ok(warning.status.lastVerifiedAt);assert.equal(warning.status.error,null)
      assert.match(warning.cleanupError!,/permission/);assert.equal(warning.managedCount,4)
    })
  } finally { fs.promises.unlink = originalUnlink }
  await manager.run()
  const cleaned = await manager.overview()
  check('a later verified backup retries retention cleanup and clears the warning',()=>{
    assert.equal(cleaned.cleanupError,null);assert.equal(cleaned.managedCount,1)
  })
  const lastGood=backupStatus(db).lastVerifiedAt
  await manager.stop()
  const stopped=await manager.overview()
  check('stopping cancels the schedule',()=>{assert.equal(stopped.schedulerRunning,false);assert.equal(stopped.nextBackupAt,null)})
  await assert.rejects(manager.run(),/stopping/)
  const before=fs.readdirSync(directory).sort()
  const proxy=new Proxy(db,{get(target,key){if(key==='backup')return async()=>{throw new Error('Simulated disk full')};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value}})
  const failed=createBackupManager(proxy,directory);failed.save({intervalMinutes:60,keepCount:1})
  await assert.rejects(failed.run(),/disk full/)
  check('failed snapshot does not prune old copies or replace the last successful backup time',()=>{
    assert.deepEqual(fs.readdirSync(directory).sort(),before);assert.equal(backupStatus(db).lastVerifiedAt,lastGood);assert.match(backupStatus(db).error!,/disk full/)
  })
  await failed.stop()
  const app=createApp(db,{dbFile:file,apiKey:'backup-test',port:0,appVersion:'0.3.40'})
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
  const baseUrl=`http://127.0.0.1:${(server.address() as any).port}`
  try{
    const denied=await fetch(baseUrl+'/api/backups')
    check('backup status/settings/run endpoints require the store pairing key',()=>assert.equal(denied.status,401))
    const headers={'X-Api-Key':'backup-test','Content-Type':'application/json'}
    const bad=await fetch(baseUrl+'/api/backups/settings',{method:'PUT',headers,body:JSON.stringify({intervalMinutes:2,keepCount:12})})
    check('backup settings API rejects unsupported frequency',()=>assert.equal(bad.status,400))
    const good=await fetch(baseUrl+'/api/backups/settings',{method:'PUT',headers,body:JSON.stringify({intervalMinutes:30,keepCount:2})})
    const payload=await good.json()
    check('backup settings API returns the saved server settings and directory',()=>{assert.equal(good.status,200);assert.equal(payload.settings.intervalMinutes,30);assert.equal(payload.directory,directory)})
    const live=getBackupManager(db,directory);live.start();await live.run()
    const opResponse=await fetch(baseUrl+'/api/operations/status',{headers}),op=await opResponse.json()
    const full=await live.overview()
    check('Home operations endpoint matches backup settings verified time and live next-run schedule',()=>{assert.equal(opResponse.status,200);assert.equal(op.backup.intervalMinutes,30);assert.equal(op.backup.lastVerifiedAt,full.status.lastVerifiedAt);assert.equal(op.backup.nextBackupAt,full.nextBackupAt);assert.equal(op.backup.schedulerRunning,true);assert.equal(op.backup.running,false)})
    const run=await fetch(baseUrl+'/api/backups/run',{method:'POST',headers,body:'{}'});const result=await run.json()
    check('Back Up Now API verifies a snapshot and returns updated storage status',()=>{assert.equal(run.status,200);assert.equal(result.managedCount,2);assert.ok(result.status.lastVerifiedAt);assert.equal(result.status.error,null)})
  }finally{await getBackupManager(db,directory).stop();await new Promise<void>(r=>server.close(()=>r()));db.close()}
}
