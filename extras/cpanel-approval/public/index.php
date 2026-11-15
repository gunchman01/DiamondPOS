<?php
declare(strict_types=1);
ini_set('display_errors','0');
ini_set('log_errors','1');
// EDIT THIS ONE PATH after uploading. No secret belongs in this public file.
$configPath = getenv('DIAMONDP_APPROVAL_CONFIG') ?: '/home/CPANEL_USERNAME/diamondpos-private/approval-config.php';
header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
function fail(int $status, string $message): never {
    http_response_code($status);
    if (isset($_GET['api'])) { header('Content-Type: application/json'); echo json_encode(['error'=>$message]); }
    else { header('Content-Type: text/plain; charset=utf-8'); echo $message; }
    exit;
}
function escaped(mixed $value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function jsonResponse(array $value): never { header('Content-Type: application/json'); echo json_encode($value, JSON_THROW_ON_ERROR); exit; }
$localTest = PHP_SAPI === 'cli-server' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'], true);
$secureRequest = in_array(strtolower((string)($_SERVER['HTTPS'] ?? '')), ['on','1'], true);
if (!$localTest && !$secureRequest) fail(400, 'Use the secure HTTPS website address.');
if (!is_file($configPath)) fail(503, 'Approval service is not configured. Please contact the shop.');
try {
    $config = require $configPath;
    if (!is_array($config) || !preg_match('/^[a-f0-9]{64}$/i', $config['api_key'] ?? '')) throw new RuntimeException('Invalid private configuration');
    $privateDir = realpath(dirname($config['database']));
    $webRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? __DIR__) ?: __DIR__;
    if (!$privateDir || str_starts_with($privateDir . '/', $webRoot . '/')) throw new RuntimeException('Database must be outside document root');
    if (str_starts_with(realpath($configPath) ?: '', $webRoot . '/')) throw new RuntimeException('Configuration must be outside document root');
    umask(0077);
    $db = new PDO('sqlite:' . $config['database'], null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    $db->exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS estimates (id TEXT PRIMARY KEY,work_order INTEGER NOT NULL,revision INTEGER NOT NULL,hash TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,snapshot TEXT NOT NULL,expires_at INTEGER NOT NULL,state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE REFERENCES estimates(id),hash TEXT NOT NULL,decision TEXT NOT NULL,name TEXT NOT NULL,comment TEXT NOT NULL,at TEXT NOT NULL);");
    $db->prepare("INSERT OR IGNORE INTO meta(key,value) VALUES ('service_id',?)")->execute([bin2hex(random_bytes(16))]);
    $serviceId = $db->query("SELECT value FROM meta WHERE key='service_id'")->fetchColumn();
} catch (Throwable $error) { error_log('DiamondPOS approval setup: ' . $error->getMessage()); fail(503, 'Approval service setup needs attention. Please contact the shop.'); }
if (isset($_GET['api'])) {
    $authorization = $_SERVER['HTTP_X_DIAMONDPOS_KEY'] ?? '';
    if (!hash_equals($config['api_key'], $authorization)) fail(401, 'Integration authentication required.');
    $op = (string)$_GET['api'];
    if ($op === 'health' && $_SERVER['REQUEST_METHOD'] === 'GET') jsonResponse(['protocol'=>1,'serviceId'=>$serviceId,'testMode'=>(bool)($config['test_mode'] ?? true)]);
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405,'Use POST for this operation.');
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) fail(413,'Request is too large.');
    try { $raw=file_get_contents('php://input', false, null, 0, 65537); if(strlen($raw)>65536)fail(413,'Request is too large.'); $body=json_decode($raw,true,32,JSON_THROW_ON_ERROR); }
    catch (Throwable) { fail(400,'Invalid request JSON.'); }
    if (!is_array($body)) fail(400,'A request object is required.');
    try {
        if ($op === 'publish') {
            foreach(['id','hash','token'] as $field) if(!is_string($body[$field] ?? null))fail(400,'Invalid estimate identity.');
            if(!preg_match('/^[a-f0-9-]{36}$/i',$body['id']) || !preg_match('/^[a-f0-9]{64}$/i',$body['hash']) || !preg_match('/^[a-f0-9]{64}$/i',$body['token']))fail(400,'Invalid estimate identity.');
            if(!is_int($body['workOrder'] ?? null)||$body['workOrder']<1||!is_int($body['revision'] ?? null)||$body['revision']<1)fail(400,'Invalid work order revision.');
            $snapshot=$body['snapshot']??null;
            if(!is_array($snapshot)||!is_array($snapshot['lines']??null)||count($snapshot['lines'])>300)fail(400,'Invalid estimate details.');
            foreach(['number','customer','unit','diagnosis','partsNotice'] as $field)if(!is_string($snapshot[$field]??null)||strlen($snapshot[$field])>10000)fail(400,'Invalid estimate text.');
            foreach(['totalCents','taxCents','balanceDueCents'] as $field)if(!is_int($snapshot[$field]??null))fail(400,'Invalid estimate amounts.');
            foreach($snapshot['lines'] as $line)if(!is_array($line)||!is_string($line['description']??null)||strlen($line['description'])>2000||!is_numeric($line['qty']??null)||!is_finite((float)$line['qty'])||!is_int($line['unitPriceCents']??null))fail(400,'Invalid estimate line.');
            $expires=strtotime((string)($body['expiresAt']??''));if(!$expires||$expires<=time()||$expires>time()+31*86400)fail(400,'Invalid estimate expiration.');
            $encoded=json_encode($snapshot,JSON_THROW_ON_ERROR);$tokenHash=hash('sha256',$body['token']);
            $db->beginTransaction();
            $find=$db->prepare('SELECT * FROM estimates WHERE id=?');$find->execute([$body['id']]);$existing=$find->fetch();
            if($existing){if($existing['hash']!==$body['hash']||$existing['token_hash']!==$tokenHash||$existing['snapshot']!==$encoded){$db->rollBack();fail(409,'Estimate identity already exists with different details.');}}
            else {
                $db->prepare("UPDATE estimates SET state='superseded' WHERE work_order=? AND state='pending'")->execute([$body['workOrder']]);
                $db->prepare("INSERT INTO estimates VALUES (?,?,?,?,?,?,?,'pending')")->execute([$body['id'],$body['workOrder'],$body['revision'],$body['hash'],$tokenHash,$encoded,$expires]);
            }
            $db->commit();jsonResponse(['serviceId'=>$serviceId,'ok'=>true]);
        }
        if($op==='cancel'){$id=$body['id']??null;if(!is_string($id))fail(400,'Estimate ID required.');$db->prepare("UPDATE estimates SET state='superseded' WHERE id=? AND state='pending'")->execute([$id]);jsonResponse(['serviceId'=>$serviceId,'ok'=>true]);}
        if($op==='decisions'){
            $after=$body['after']??null;if(!is_int($after)||$after<0)fail(400,'Invalid event cursor.');
            $q=$db->prepare('SELECT sequence,id,hash,decision,name,comment,at FROM decisions WHERE sequence>? ORDER BY sequence LIMIT 100');$q->execute([$after]);
            $events=$q->fetchAll();foreach($events as &$event)$event['sequence']=(int)$event['sequence'];unset($event);
            jsonResponse(['serviceId'=>$serviceId,'events'=>$events]);
        }
        fail(404,'Unknown API operation.');
    } catch(Throwable $error){if($db->inTransaction())$db->rollBack();error_log('DiamondPOS approval API: '.$error->getMessage());fail(500,'Could not save the request. Retry or contact the shop.');}
}
$token=(string)($_GET['token']??'');
if(!preg_match('/^[a-f0-9]{64}$/i',$token))fail(404,'Open the private approval link from your estimate email.');
$tokenHash=hash('sha256',$token);$q=$db->prepare('SELECT * FROM estimates WHERE token_hash=?');$q->execute([$tokenHash]);$estimate=$q->fetch();
if(!$estimate)fail(404,'This estimate link was not found. Please contact the shop.');
if($estimate['state']==='superseded')fail(410,'This estimate link has been replaced or cancelled. Use your latest estimate email or call the shop.');
if((int)$estimate['expires_at']<time()&&$estimate['state']==='pending')fail(410,'This estimate link has expired. Please contact the shop for an updated estimate.');
if(!is_dir($privateDir.'/sessions')&&!mkdir($privateDir.'/sessions',0700))fail(503,'Could not initialize secure session storage.');
session_save_path($privateDir.'/sessions');
session_name('DiamondApproval');
ini_set('session.use_strict_mode','1');
session_set_cookie_params(['lifetime'=>0,'path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/').'/','secure'=>!$localTest,'httponly'=>true,'samesite'=>'Lax']);
if(!session_start())fail(503,'Could not start the confirmation session.');
$message='';$formError='';
if($_SERVER['REQUEST_METHOD']==='POST'){
    $csrf=(string)($_POST['csrf']??'');
    if(!isset($_SESSION['csrf'])||!hash_equals($_SESSION['csrf'],$csrf)||(int)($_SESSION['csrf_at']??0)<time()-1800)fail(403,'This confirmation form expired. Reload the estimate and try again.');
    $decision=(string)($_POST['decision']??'');$name=trim((string)($_POST['name']??''));$comment=trim((string)($_POST['comment']??''));
    if(!in_array($decision,['approved','declined'],true)||!$name||strlen($name)>100||strlen($comment)>1000||($_POST['confirm']??'')!=='yes')$formError='Enter your name, select a decision and confirm you reviewed this estimate.';
    else {
        try {
            $db->beginTransaction();
            $update=$db->prepare("UPDATE estimates SET state=? WHERE id=? AND state='pending' AND expires_at>=?");$update->execute([$decision,$estimate['id'],time()]);
            if($update->rowCount()===1){$db->prepare('INSERT INTO decisions(id,hash,decision,name,comment,at) VALUES (?,?,?,?,?,?)')->execute([$estimate['id'],$estimate['hash'],$decision,$name,$comment,gmdate('Y-m-d\TH:i:s\Z')]);$estimate['state']=$decision;}
            else { $latest=$db->prepare('SELECT state,expires_at FROM estimates WHERE id=?');$latest->execute([$estimate['id']]);$current=$latest->fetch();if(!$current||!in_array($current['state'],['approved','declined'],true)){$db->rollBack();fail(410,'This estimate is expired or replaced. Please contact the shop.');}$estimate['state']=$current['state']; }
            $db->commit();$message='Your decision has been recorded. The shop will receive it when DiamondPOS next connects. It applies only to this estimate revision; please call the shop if you need to change it.';
        }catch(Throwable $error){if($db->inTransaction())$db->rollBack();error_log('DiamondPOS approval form: '.$error->getMessage());$formError='Your response could not be saved. Please retry or call the shop.';}
    }
}
$_SESSION['csrf']??=bin2hex(random_bytes(32));$_SESSION['csrf_at']??=time();
if($_SERVER['REQUEST_METHOD']==='GET'&&(int)$_SESSION['csrf_at']<time()-1800){$_SESSION['csrf']=bin2hex(random_bytes(32));$_SESSION['csrf_at']=time();}
$csrf=$_SESSION['csrf'];session_write_close();$snapshot=json_decode($estimate['snapshot'],true,32,JSON_THROW_ON_ERROR);
function dollars(int $cents): string { return ($cents<0?'-':'').'$'.number_format(abs($cents)/100,2); }
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Repair estimate | <?=escaped($config['store_name'])?></title><style>
*{box-sizing:border-box}body{margin:0;background:#f1f3ef;color:#24372b;font:16px/1.6 system-ui,sans-serif}main{max-width:780px;margin:30px auto;padding:24px;background:white;border-radius:16px;box-shadow:0 8px 28px #0001}header{border-bottom:3px solid #467a42;padding-bottom:16px}h1{font-size:28px;line-height:1.25}h2{font-size:20px}p{white-space:pre-line}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px 5px;border-bottom:1px solid #ddd}.amount{text-align:right}.notice{background:#fff4d6;padding:14px;border-radius:8px}.success{background:#e5f4e4;padding:16px;border-radius:8px}.error{color:#a21d2c}label{display:block;margin:14px 0}input[type=text],textarea,select{display:block;width:100%;font:inherit;padding:10px;border:1px solid #aab5aa;border-radius:6px}button{background:#285a35;color:white;font:inherit;padding:12px 22px;border:0;border-radius:6px;cursor:pointer}.muted{color:#67776a;font-size:13px}.summary{display:flex;justify-content:space-between;font-size:20px;font-weight:700}.scroll{overflow:auto}@media(max-width:600px){main{margin:0;border-radius:0;padding:18px}h1{font-size:24px}}
</style></head><body><main><header><strong><?=escaped($config['store_name'])?></strong><?php if($config['test_mode']??true):?><div class="notice">STAGING TEST — use test work orders only. Responses are recorded and can update the connected test POS.</div><?php endif?><h1>Your repair estimate</h1><div><?=escaped($snapshot['number'])?> · Revision <?=escaped($estimate['revision'])?></div><div><?=escaped($snapshot['unit'])?></div></header>
<p>Hello <?=escaped($snapshot['customer'])?>, please review this estimate before confirming your decision.</p><h2>Repair details</h2><p><?=escaped($snapshot['diagnosis'])?></p>
<?php if($snapshot['partsNotice']):?><p class="notice"><?=escaped($snapshot['partsNotice'])?></p><?php endif?>
<div class="scroll"><table><thead><tr><th>Item / work</th><th>Qty</th><th class="amount">Unit price</th><th class="amount">Amount</th></tr></thead><tbody><?php foreach($snapshot['lines'] as $line):?><tr><td><?=escaped($line['description'])?></td><td><?=escaped($line['qty'])?></td><td class="amount"><?=dollars($line['unitPriceCents'])?></td><td class="amount"><?=dollars((int)round($line['qty']*$line['unitPriceCents']))?></td></tr><?php endforeach?></tbody></table></div>
<p class="amount">Sales tax: <?=dollars($snapshot['taxCents'])?></p><p class="summary"><span>Total estimate</span><span><?=dollars($snapshot['totalCents'])?></span></p><p class="amount">Balance after any paid estimate fee: <?=dollars($snapshot['balanceDueCents'])?></p>
<?php if($message):?><p class="success"><?=escaped($message)?></p><?php endif?>
<?php if($estimate['state']!=='pending'):?><h2>Decision: <?=escaped($estimate['state'])?></h2><p>Please contact the shop to change a recorded decision.</p>
<?php else:?><h2>Your decision</h2><?php if($formError):?><p class="error" role="alert"><?=escaped($formError)?></p><?php endif?><form method="post"><input type="hidden" name="csrf" value="<?=escaped($csrf)?>"><label>Your name<input type="text" name="name" required maxlength="100" autocomplete="name"></label><label>Decision<select name="decision" required><option value="">Choose…</option><option value="approved" <?=($_GET['choice']??'')==='approved'?'selected':''?>>Approve this estimate</option><option value="declined" <?=($_GET['choice']??'')==='declined'?'selected':''?>>Decline this estimate</option></select></label><label>Comments (optional)<textarea name="comment" maxlength="1000" rows="3"></textarea></label><label><input type="checkbox" name="confirm" value="yes" required> I reviewed revision <?=escaped($estimate['revision'])?> totaling <?=dollars($snapshot['totalCents'])?> and confirm the decision selected above.</label><button type="submit">Confirm decision</button></form><?php endif?>
<p class="muted">This private link is specific to this estimate revision. Approval authorizes the listed repair only and does not take a payment. A changed estimate requires new approval. Link expires <?=escaped(gmdate('M j, Y',(int)$estimate['expires_at']))?> (UTC).</p></main></body></html>
