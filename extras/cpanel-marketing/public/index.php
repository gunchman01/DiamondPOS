<?php
declare(strict_types=1);
// Change this PATH only. The actual key/database belong outside public_html.
$configPath = getenv('DIAMONDP_MARKETING_CONFIG') ?: '/home/YOUR_CPANEL_USERNAME/diamondpos-private/marketing-config.php';
header('Cache-Control: no-store');header('Referrer-Policy: no-referrer');header('X-Content-Type-Options: nosniff');header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
function jsonOut(array $data,int $code=200):never {http_response_code($code);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_THROW_ON_ERROR);exit;}
function emailKey(mixed $value):string {$email=strtolower(trim(is_string($value)?$value:''));if(strlen($email)>254||!preg_match('/^[\x21-\x7e]+$/D',$email)||!filter_var($email,FILTER_VALIDATE_EMAIL))throw new InvalidArgumentException('Invalid email');return $email;}
function page(string $title,string $text,string $token='',bool $confirm=false):never {header('Content-Type: text/html; charset=utf-8');$e=fn($s)=>htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$e($title).'</title><style>body{font:18px Arial;background:#f5f5f3;color:#222;padding:24px}main{max-width:560px;margin:10vh auto;background:white;padding:30px;border-top:5px solid #b21c25}button{font:inherit;padding:14px;background:#b21c25;color:white;border:0;cursor:pointer}p{line-height:1.6}</style><main><h1>'.$e($title).'</h1><p>'.$e($text).'</p>';if($confirm)echo '<form method="post"><input type="hidden" name="token" value="'.$e($token).'"><input type="hidden" name="confirm" value="yes"><button>Unsubscribe from marketing</button></form>';echo '<p><a href="?action=subscribe">Request marketing subscription</a></p></main></html>';exit;}
$localTest=PHP_SAPI==='cli-server'&&in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true);
if(!$localTest&&!in_array(strtolower((string)($_SERVER['HTTPS']??'')),['on','1'],true))jsonOut(['ok'=>false,'error'=>'Use HTTPS'],400);
try {
 $realConfig=realpath($configPath);$document=realpath($_SERVER['DOCUMENT_ROOT']??__DIR__);
 if(!$realConfig||!$document||str_starts_with($realConfig,$document.DIRECTORY_SEPARATOR))throw new RuntimeException('Private configuration required');
 $cfg=require $realConfig;
 if(!is_array($cfg)||!preg_match('/^[a-f0-9]{64}$/iD',$cfg['api_key']??''))throw new RuntimeException('Configure key');
 $public=(string)($cfg['public_url']??'');$parts=parse_url($public);
 if(!$parts||($parts['scheme']??'')!=='https'||empty($parts['host'])||isset($parts['query'])||isset($parts['fragment'])||isset($parts['user']))throw new RuntimeException('Configure public URL');
 $file=(string)($cfg['database']??'');$parent=realpath(dirname($file));if(!$parent||str_starts_with($parent.DIRECTORY_SEPARATOR,$document.DIRECTORY_SEPARATOR))throw new RuntimeException('Private database required');
 $existing=realpath($file);if($existing&&str_starts_with($existing,$document.DIRECTORY_SEPARATOR))throw new RuntimeException('Private database required');
 $db=new PDO('sqlite:'.$file);$db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$db->exec('PRAGMA busy_timeout=5000');
 $db->exec('CREATE TABLE IF NOT EXISTS suppressions(email TEXT PRIMARY KEY,at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY,email TEXT NOT NULL,created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL,at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS acknowledgements(client_id TEXT PRIMARY KEY,cursor INTEGER NOT NULL);');
 @chmod($file,0600);
 $now=fn()=>gmdate('Y-m-d\TH:i:s\Z');
 require_once __DIR__.'/subscriptions.php';subscriptionSchema($db);
 $suppress=function(string $email,string $intent='optout',?string $changeId=null)use($db,$now):void{
  $db->beginTransaction();try{
   if($changeId!==null){$q=$db->prepare('INSERT OR IGNORE INTO consent_changes(change_id) VALUES(?)');$q->execute([$changeId]);if(!$q->rowCount()){$db->commit();return;}}
   if($intent==='restore'){$q=$db->prepare('SELECT kind FROM events WHERE email=? ORDER BY id DESC LIMIT 1');$q->execute([$email]);if($q->fetchColumn()==='subscribed'){$db->commit();return;}}
   $q=$db->prepare('INSERT OR IGNORE INTO suppressions(email,at) VALUES(?,?)');$at=$now();$q->execute([$email,$at]);if($q->rowCount()){$q=$db->prepare("INSERT INTO events(email,at,kind) VALUES(?,?,'suppressed')");$q->execute([$email,$at]);}
   if($intent==='optout'){$q=$db->prepare("UPDATE subscription_requests SET status='cancelled' WHERE email=? AND status IN ('pending','emailed')");$q->execute([$email]);}
   $db->commit();
  }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 };
 require_once __DIR__.'/tracking.php';trackingSchema($db);
 $action=(string)($_GET['action']??'');
 if(in_array($action,['subscribe','confirmSubscription'],true))publicSubscription($db,$cfg,$action);
 if(in_array($action,['open','click'],true))trackingPublic($db,$action);
 if($action===''){
  $token=(string)($_POST['token']??$_GET['token']??'');
  if(!preg_match('/^[a-f0-9]{64}$/iD',$token))page('Marketing preferences','This link is invalid. Please contact the shop to stop marketing emails.');
  $q=$db->prepare('SELECT email FROM tokens WHERE hash=?');$q->execute([hash('sha256',$token)]);$email=$q->fetchColumn();
  if(!$email)page('Marketing preferences','This link is invalid. Please contact the shop.');
  if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'&&isset($_POST['confirm'])&&$_POST['confirm']==='yes'){$suppress((string)$email);page('You are unsubscribed','You will no longer receive marketing emails from '.(string)($cfg['store_name']??'the shop').'. Repair estimates and work-order updates are separate.');}
  page('Unsubscribe from marketing','Confirm below to stop marketing emails. Viewing this page alone does not change your preferences.',$token,true);
 }
 if(!hash_equals((string)$cfg['api_key'],(string)($_SERVER['HTTP_X_DIAMONDPOS_KEY']??'')))jsonOut(['ok'=>false,'error'=>'Unauthorized'],401);
 if(($_SERVER['REQUEST_METHOD']??'')!=='POST')jsonOut(['ok'=>false,'error'=>'Use POST'],405);
 if((int)($_SERVER['CONTENT_LENGTH']??0)>65536)jsonOut(['ok'=>false,'error'=>'Request too large'],413);
 $body=json_decode(file_get_contents('php://input'),true,64,JSON_THROW_ON_ERROR);if(!is_array($body))throw new InvalidArgumentException('Expected object');
 if($action==='capabilities')jsonOut(['ok'=>true,'consentVersion'=>2]);
 if($action==='prepareTracking')prepareTracking($db,$body,$public);
 if($action==='activity')activityFeed($db,$body);
 if(in_array($action,['requestSubscription','subscriptionRequests','prepareSubscription','subscriptionSent','subscriptionIgnored'],true))subscriptionApi($db,$body,$action,$public);
 if($action==='suppress'){
  if(($body['consentVersion']??null)!==2)jsonOut(['ok'=>false,'error'=>'Update the Store Server for confirmed subscriptions'],409);
  $intent=$body['intent']??'optout';$changeId=$body['changeId']??null;if(!in_array($intent,['optout','restore'],true)||($changeId!==null&&(!is_string($changeId)||!preg_match('/^[a-f0-9]{64}$/D',$changeId))))throw new InvalidArgumentException('Invalid opt-out');
  $suppress(emailKey($body['email']??null),$intent,$changeId);jsonOut(['ok'=>true]);
 }
 if($action==='prepare'){
  $email=emailKey($body['email']??null);$q=$db->prepare('SELECT 1 FROM suppressions WHERE email=?');$q->execute([$email]);if($q->fetchColumn())jsonOut(['ok'=>true,'suppressed'=>true]);
  $token=bin2hex(random_bytes(32));$q=$db->prepare('INSERT INTO tokens(hash,email,created_at) VALUES(?,?,?)');$q->execute([hash('sha256',$token),$email,$now()]);
  jsonOut(['ok'=>true,'suppressed'=>false,'unsubscribeUrl'=>$public.'?token='.$token]);
 }
 if($action==='pull'){
  if(($body['consentVersion']??null)!==2)jsonOut(['ok'=>false,'error'=>'Update the Store Server for confirmed subscriptions'],409);
  $cursor=$body['cursor']??null;if(!is_int($cursor)||$cursor<0)throw new InvalidArgumentException('Invalid cursor');
  $max=(int)$db->query('SELECT COALESCE(MAX(id),0) FROM events')->fetchColumn();if($cursor>$max)jsonOut(['ok'=>false,'error'=>'Website history restored; replay suppression history in POS'],409);
  $q=$db->prepare('SELECT id,email,at,kind,request_id AS requestId FROM events WHERE id>? ORDER BY id LIMIT 201');$q->execute([$cursor]);$events=$q->fetchAll(PDO::FETCH_ASSOC);$more=count($events)>200;jsonOut(['ok'=>true,'consentVersion'=>2,'events'=>array_slice($events,0,200),'hasMore'=>$more]);
 }
 if($action==='ack'){
  $cursor=$body['cursor']??null;$client=(string)($body['clientId']??'');if(!is_int($cursor)||$cursor<0||!preg_match('/^[a-f0-9-]{36}$/iD',$client))throw new InvalidArgumentException('Invalid acknowledgement');
  $max=(int)$db->query('SELECT COALESCE(MAX(id),0) FROM events')->fetchColumn();if($cursor>$max)throw new InvalidArgumentException('Acknowledgement exceeds event sequence');
  $q=$db->prepare('INSERT INTO acknowledgements(client_id,cursor) VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET cursor=MAX(cursor,excluded.cursor)');$q->execute([$client,$cursor]);jsonOut(['ok'=>true]);
 }
 jsonOut(['ok'=>false,'error'=>'Unknown action'],404);
} catch(InvalidArgumentException|JsonException $e){jsonOut(['ok'=>false,'error'=>'Invalid request'],400);}catch(Throwable $e){error_log('DiamondPOS marketing service failure: '.$e->getMessage());jsonOut(['ok'=>false,'error'=>'Marketing service needs attention; contact the shop'],503);}
