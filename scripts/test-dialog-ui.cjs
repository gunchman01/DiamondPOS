// Optional real Chromium DOM/focus smoke check. Never opens user data or sends network requests.
const {pathToFileURL}=require('node:url')
const {buildSync}=require('esbuild'),{spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path')
const dir=fs.mkdtempSync(path.join(__dirname,'../node_modules/.diamondpos-dialog-ui-'))
try{
 buildSync({entryPoints:[path.join(__dirname,'../tests/dialog-ui.tsx')],outfile:path.join(dir,'fixture.js'),bundle:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
 fs.writeFileSync(path.join(dir,'fixture.html'),'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><pre id="test-results">Pending</pre><script src="fixture.js"></script></body></html>')
 const browser=process.env.DIAMONDP_TEST_CHROMIUM||'chromium',result=spawnSync(browser,['--user-data-dir='+path.join(dir,'profile'),'--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-extensions','--no-first-run','--dump-dom','--virtual-time-budget=4000',pathToFileURL(path.join(dir,'fixture.html')).toString()],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024})
 if(result.error)throw result.error
 if(!result.stdout.includes('data-status="passed"'))throw Error((result.stdout.match(/<pre id="test-results"[^>]*>(.*?)<\/pre>/s)||[])[1]||'Browser did not finish the dialog test: '+String(result.status)+' '+result.stderr.slice(0,1600))
 console.log('PASS 20 real Chromium confirmation/focus/typing cycles and shutdown cancellation')
}finally{fs.rmSync(dir,{recursive:true,force:true})}
