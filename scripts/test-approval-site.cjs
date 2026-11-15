// Optional PHP integration check: PHP 8.1+ CLI with PDO SQLite and sessions required.
// Does not contact staging, send email, or use real customer data.
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  net = require('node:net'),
  crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process'),
  assert = require('node:assert/strict')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondpos-php-')),
  pub = path.join(dir, 'public'),
  key = 'a'.repeat(64)
fs.mkdirSync(pub)
fs.copyFileSync(path.join(__dirname, '../extras/cpanel-approval/public/index.php'), path.join(pub, 'index.php'))
const config = path.join(dir, 'config.php'),
  database = path.join(dir, 'approval.sqlite')
fs.writeFileSync(
  config,
  `<?php return ['api_key'=>'${key}','database'=>__DIR__.'/approval.sqlite','store_name'=>'Diamond P test','test_mode'=>true];`
)
const bin = process.env.DIAMONDP_PHP_BIN || 'php',
  args = JSON.parse(process.env.DIAMONDP_PHP_ARGS || '[]')
let server,
  log = '',
  checks = 0
function check(name, fn) {
  fn()
  checks++
  console.log('PASS ' + name)
}
async function main() {
  const lint = spawnSync(bin, [...args, '-l', path.join(pub, 'index.php')], { encoding: 'utf8' })
  if (lint.error) throw lint.error
  assert.equal(lint.status, 0, lint.stdout + lint.stderr)
  const probe = net.createServer()
  await new Promise((r) => probe.listen(0, '127.0.0.1', r))
  const port = probe.address().port
  await new Promise((r) => probe.close(r))
  server = spawn(bin, [...args, '-S', `127.0.0.1:${port}`, '-t', pub], {
    env: { ...process.env, DIAMONDP_APPROVAL_CONFIG: config },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  server.stdout.on('data', (b) => {
    log += b
  })
  server.stderr.on('data', (b) => {
    log += b
  })
  const base = `http://127.0.0.1:${port}/index.php`
  for (let n = 0; n < 80; n++) {
    try {
      await fetch(base)
      break
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  const api = async (op, body, secret = key) => {
    const r = await fetch(base + '?api=' + op, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-DiamondPOS-Key': secret, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: r.status, data: await r.json() }
  }
  const health = await api('health')
  check('PHP health requires the API key and exposes no secret', () => {
    assert.equal(health.status, 200, JSON.stringify(health.data))
    assert.equal(health.data.protocol, 1)
    assert.ok(!JSON.stringify(health.data).includes(key))
  })
  const unauthorized = await api('decisions', { after: 0 }, 'wrong')
  check('decision API rejects unauthorized readers', () => assert.equal(unauthorized.status, 401))
  const payload = (revision = 1) => ({
    id: crypto.randomUUID(),
    workOrder: 1,
    revision,
    hash: 'b'.repeat(64),
    token: crypto.randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    snapshot: {
      number: 'WO-1',
      customer: 'Test',
      unit: 'Mower',
      diagnosis: 'Repair <script>alert(1)</script>',
      lines: [{ description: 'Part & labor', qty: 1, unitPriceCents: 100 }],
      totalCents: 110,
      taxCents: 10,
      balanceDueCents: 110,
      partsNotice: 'Part must be ordered; could take a week'
    }
  })
  const p = payload(),
    publish = await api('publish', p)
  check('publishes a revision-bound estimate', () => assert.equal(publish.status, 200, JSON.stringify(publish.data)))
  assert.equal((await api('publish', p)).status, 200)
  const url = base + '?token=' + p.token + '&choice=approved',
    view = await fetch(url),
    html = await view.text(),
    cookie = view.headers.get('set-cookie').split(';')[0],
    csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)[1]
  check('opening an approval email link only displays an escaped estimate and confirmation form', () => {
    assert.equal(view.status, 200)
    assert.ok(html.includes('Repair &lt;script&gt;'))
    assert.ok(!html.includes('Repair <script>'))
    assert.ok(html.includes('Confirm decision'))
    assert.ok(!html.includes(key))
  })
  assert.equal((await api('decisions', { after: 0 })).data.events.length, 0)
  const form = async (values) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values)
    })
    return { status: r.status, text: await r.text() }
  }
  const forbidden = await form({ decision: 'approved', name: 'Test', confirm: 'yes' })
  check('confirmation POST rejects missing CSRF token', () => assert.equal(forbidden.status, 403))
  const posted = await form({ csrf, decision: 'approved', name: 'Test customer', comment: 'Please proceed', confirm: 'yes' })
  check('customer confirmation records the selected decision', () => {
    assert.equal(posted.status, 200)
    assert.ok(posted.text.includes('Your decision has been recorded'))
  })
  await form({ csrf, decision: 'declined', name: 'Test customer', comment: 'duplicate', confirm: 'yes' })
  const events = await api('decisions', { after: 0 })
  check('repeat submissions cannot overwrite a decision or generate duplicate events', () => {
    assert.equal(events.data.events.length, 1)
    assert.equal(events.data.events[0].decision, 'approved')
    assert.equal(events.data.events[0].hash, p.hash)
    assert.equal(events.data.events[0].name, 'Test customer')
  })
  const next = payload(2)
  await api('publish', next)
  const replacement = payload(3)
  await api('publish', replacement)
  const stale = await fetch(base + '?token=' + next.token)
  check('new revision makes an unanswered old link unusable', () => assert.equal(stale.status, 410))
  await api('cancel', { id: replacement.id })
  const cancelled = await fetch(base + '?token=' + replacement.token)
  check('cancelled links cannot record decisions', () => assert.equal(cancelled.status, 410))
  const expired = payload(4)
  expired.expiresAt = '2000-01-01T00:00:00Z'
  const invalid = await api('publish', expired)
  check('expired estimates are rejected', () => assert.equal(invalid.status, 400))
  const conflict = await api('publish', { ...p, token: 'c'.repeat(64) })
  check('estimate identities cannot be republished with changed secrets', () => assert.equal(conflict.status, 409))
  const oldConfig = fs.readFileSync(config, 'utf8')
  fs.writeFileSync(config, oldConfig.replace("__DIR__.'/approval.sqlite'", "__DIR__.'/public/approval.sqlite'"))
  const insecure = await api('health')
  check('database configuration inside a public folder is refused', () => assert.equal(insecure.status, 503))
  console.log(`\n${checks} PHP approval checks passed.`)
}
main()
  .catch((e) => {
    console.error(e)
    console.error(log.slice(-3000))
    process.exitCode = 1
  })
  .finally(async () => {
    if (server) {
      server.kill()
      await new Promise((r) => server.once('close', r))
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })
