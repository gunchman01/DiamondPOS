<?php
declare(strict_types=1);
// Confirmation email is delivered by the paired Store Server, never PHP mail().
function subscriptionSchema(PDO $db):void {
 $columns=$db->query('PRAGMA table_info(events)')->fetchAll(PDO::FETCH_ASSOC);$names=array_column($columns,'name');
 if(!in_array('kind',$names,true))$db->exec("ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT 'suppressed'");
 if(!in_array('request_id',$names,true))$db->exec('ALTER TABLE events ADD COLUMN request_id TEXT');
 $db->exec("CREATE TABLE IF NOT EXISTS consent_changes(change_id TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS subscription_requests(id TEXT PRIMARY KEY,email TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,sent_at TEXT,confirmed_revision INTEGER);CREATE INDEX IF NOT EXISTS idx_subscription_pending ON subscription_requests(status,next_attempt);CREATE INDEX IF NOT EXISTS idx_subscription_email ON subscription_requests(email,created_at);CREATE TABLE IF NOT EXISTS subscription_tokens(hash TEXT PRIMARY KEY,request_id TEXT NOT NULL,expires INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS subscription_rate(bucket TEXT PRIMARY KEY,n INTEGER NOT NULL);");
}
function consentRevision(PDO $db,string $email):int {$q=$db->prepare('SELECT COALESCE(MAX(id),0) FROM events WHERE email=?');$q->execute([$email]);return (int)$q->fetchColumn();}
function queueSubscription(PDO $db,string $email,?string $ipBucket=null):?string {
 $db->beginTransaction();try{
  $q=$db->prepare("SELECT id,created_at FROM subscription_requests WHERE email=? ORDER BY created_at DESC,rowid DESC LIMIT 1");$q->execute([$email]);$last=$q->fetch(PDO::FETCH_ASSOC);
  if($last&&strtotime($last['created_at'])>time()-300){$db->commit();return null;}
  $q=$db->prepare('SELECT COUNT(*) FROM subscription_requests WHERE email=? AND created_at>=?');$q->execute([$email,gmdate('Y-m-d\TH:i:s\Z',time()-86400)]);if((int)$q->fetchColumn()>=3){$db->commit();return null;}
  if($ipBucket!==null){$q=$db->prepare('SELECT n FROM subscription_rate WHERE bucket=?');$q->execute([$ipBucket]);if((int)$q->fetchColumn()>=5){$db->commit();return null;}$q=$db->prepare('INSERT INTO subscription_rate(bucket,n) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET n=n+1');$q->execute([$ipBucket]);}
  $q=$db->prepare('SELECT COUNT(*) FROM subscription_requests WHERE created_at>=?');$q->execute([gmdate('Y-m-d\TH:i:s\Z',time()-86400)]);if((int)$q->fetchColumn()>=300){$db->commit();return null;}
  $id=bin2hex(random_bytes(32));$q=$db->prepare('INSERT INTO subscription_requests(id,email,revision,created_at) VALUES(?,?,?,?)');$q->execute([$id,$email,consentRevision($db,$email),gmdate('Y-m-d\TH:i:s\Z')]);
  $db->exec("DELETE FROM subscription_rate WHERE substr(bucket,1,10)<'".gmdate('Y-m-d',time()-172800)."'");$db->commit();return $id;
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function subscriptionPage(string $title,string $text,string $form=''):never {
 header('Content-Type: text/html; charset=utf-8');$e=fn($s)=>htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$e($title).'</title><style>body{font:18px Arial;background:#f5f5f3;color:#222;padding:24px}main{max-width:560px;margin:7vh auto;background:white;padding:30px;border-top:5px solid #b21c25}button{font:inherit;padding:14px;background:#b21c25;color:white;border:0}input[type=email]{font:inherit;width:95%;padding:10px}p,label{line-height:1.6}label{display:block;margin:14px 0}.hp{display:none}</style><main><h1>'.$e($title).'</h1><p>'.$e($text).'</p>'.$form.'</main></html>';exit;
}
function publicSubscription(PDO $db,array $cfg,string $action):never {
 $e=fn($s)=>htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');$method=$_SERVER['REQUEST_METHOD']??'GET';$store=(string)($cfg['store_name']??'Diamond P Lawn and Garden');
 if($action==='subscribe'){
  if($method==='POST'){
   $csrf=(string)($_POST['csrf']??'');$pieces=explode(':',$csrf);$valid=count($pieces)===3&&preg_match('/^[0-9]+$/D',$pieces[0])&&(int)$pieces[0]<=time()+60&&(int)$pieces[0]>=time()-1800&&hash_equals(hash_hmac('sha256',$pieces[0].':'.$pieces[1],$cfg['api_key']),$pieces[2]);
   if(!$valid)subscriptionPage('Please try again','This form expired. Open the subscription page again.');
   if(($_POST['nickname']??'')===''&&($_POST['agree']??'')==='yes'){
    try{$email=emailKey($_POST['email']??null);$bucket=gmdate('Y-m-d\TH').':'.hash_hmac('sha256',(string)($_SERVER['REMOTE_ADDR']??''),$cfg['api_key']);queueSubscription($db,$email,$bucket);}catch(InvalidArgumentException $ignored){}
   }
   subscriptionPage('Check your email','If this email matches an active customer record, we will send a confirmation when the shop server is available. Your preferences have not changed yet. Check your spam folder; requests are limited to prevent abuse.');
  }
  if($method!=='GET')jsonOut(['ok'=>false,'error'=>'Use GET or POST'],405);
  $signed=time().':'.bin2hex(random_bytes(16));$csrf=$signed.':'.hash_hmac('sha256',$signed,$cfg['api_key']);
  subscriptionPage('Subscribe to marketing','Request marketing emails from '.$store.'. Use the email address already on your customer record. You can unsubscribe at any time. We will email a confirmation; this form alone does not subscribe you.','<form method="post"><input type="hidden" name="csrf" value="'.$e($csrf).'"><label>Email address<input type="email" name="email" required maxlength="254" autocomplete="email"></label><label class="hp">Leave blank<input name="nickname" tabindex="-1" autocomplete="off"></label><label><input type="checkbox" name="agree" value="yes" required> I want to receive marketing emails and request a confirmation.</label><button>Request confirmation email</button></form>');
 }
 if(!in_array($method,['GET','POST'],true))jsonOut(['ok'=>false,'error'=>'Use GET or POST'],405);
 $token=(string)($_POST['token']??$_GET['token']??'');$request=false;
 if(preg_match('/^[a-f0-9]{64}$/D',$token)){$q=$db->prepare('SELECT r.*,t.expires FROM subscription_tokens t JOIN subscription_requests r ON r.id=t.request_id WHERE t.hash=?');$q->execute([hash('sha256',$token)]);$request=$q->fetch(PDO::FETCH_ASSOC);}
 if(!$request)subscriptionPage('Confirmation unavailable','This confirmation link is invalid. Request a new confirmation from the marketing subscription page.');
 if((int)$request['expires']<time())subscriptionPage('Confirmation expired','This link has expired. Request a new confirmation from the marketing subscription page.');
 if($method==='POST'&&($_POST['confirm']??'')==='yes'){
  $db->beginTransaction();try{
   $q=$db->prepare('SELECT * FROM subscription_requests WHERE id=?');$q->execute([$request['id']]);$current=$q->fetch(PDO::FETCH_ASSOC);$revision=consentRevision($db,$request['email']);
   if($current['status']==='confirmed'&&(int)$current['confirmed_revision']===$revision){$db->commit();subscriptionPage('Already confirmed','Your marketing subscription was already confirmed.');}
   if(!in_array($current['status'],['pending','emailed'],true)||(int)$current['revision']!==$revision){$db->rollBack();subscriptionPage('New confirmation needed','Your preferences changed after this request. This older link cannot subscribe you. Request a new confirmation.');}
   $q=$db->prepare("INSERT INTO events(email,at,kind,request_id) VALUES(?,?,'subscribed',?)");$q->execute([$request['email'],gmdate('Y-m-d\TH:i:s\Z'),$request['id']]);$confirmed=(int)$db->lastInsertId();
   $q=$db->prepare('DELETE FROM suppressions WHERE email=?');$q->execute([$request['email']]);$q=$db->prepare("UPDATE subscription_requests SET status='confirmed',confirmed_revision=? WHERE id=?");$q->execute([$confirmed,$request['id']]);$db->commit();
   subscriptionPage('Marketing subscription confirmed','Thank you. You have confirmed marketing emails from '.$store.'. The shop POS will update when it next connects. A newer opt-out still takes priority; emails already skipped are not resent.');
  }catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
 }
 subscriptionPage('Confirm your subscription','Click below only if you want marketing emails from '.$store.'. Emails may record estimated opens, link clicks and approximate request locations. You can unsubscribe at any time. Viewing this page does not change your preferences.','<form method="post"><input type="hidden" name="token" value="'.$e($token).'"><input type="hidden" name="confirm" value="yes"><button>Confirm marketing subscription</button></form>');
}
function subscriptionApi(PDO $db,array $body,string $action,string $public):never {
 if(($body['consentVersion']??null)!==2)jsonOut(['ok'=>false,'error'=>'Update the Store Server for confirmed subscriptions'],409);
 if($action==='requestSubscription'){$email=emailKey($body['email']??null);$id=queueSubscription($db,$email);jsonOut(['ok'=>true,'requestId'=>$id,'queued'=>$id!==null]);}
 if($action==='subscriptionRequests'){
  $q=$db->prepare("SELECT id,email,created_at AS requestedAt FROM subscription_requests WHERE status='pending' AND next_attempt<=? ORDER BY created_at,id LIMIT 20");$q->execute([time()]);jsonOut(['ok'=>true,'requests'=>$q->fetchAll(PDO::FETCH_ASSOC)]);
 }
 $id=(string)($body['requestId']??'');if(!preg_match('/^[a-f0-9]{64}$/D',$id))throw new InvalidArgumentException('Invalid request');
 if($action==='subscriptionIgnored'){$q=$db->prepare("UPDATE subscription_requests SET status='cancelled' WHERE id=? AND status='pending'");$q->execute([$id]);jsonOut(['ok'=>true]);}
 if($action==='subscriptionSent'){$q=$db->prepare("UPDATE subscription_requests SET status='emailed',sent_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM subscription_tokens WHERE request_id=?)");$q->execute([gmdate('Y-m-d\TH:i:s\Z'),$id,$id]);jsonOut(['ok'=>true]);}
 if($action!=='prepareSubscription')jsonOut(['ok'=>false,'error'=>'Unknown action'],404);
 $db->beginTransaction();try{
  $q=$db->prepare('SELECT * FROM subscription_requests WHERE id=?');$q->execute([$id]);$request=$q->fetch(PDO::FETCH_ASSOC);
  if(!$request||$request['status']!=='pending'||(int)$request['next_attempt']>time()){$db->commit();jsonOut(['ok'=>true,'ready'=>false]);}
  if((int)$request['revision']!==consentRevision($db,$request['email'])||(int)$request['attempts']>=3){$q=$db->prepare("UPDATE subscription_requests SET status='cancelled' WHERE id=?");$q->execute([$id]);$db->commit();jsonOut(['ok'=>true,'ready'=>false]);}
  $token=bin2hex(random_bytes(32));$expires=time()+86400;$q=$db->prepare('INSERT INTO subscription_tokens(hash,request_id,expires) VALUES(?,?,?)');$q->execute([hash('sha256',$token),$id,$expires]);$q=$db->prepare('UPDATE subscription_requests SET attempts=attempts+1,next_attempt=? WHERE id=?');$q->execute([time()+300,$id]);$db->commit();
  jsonOut(['ok'=>true,'ready'=>true,'email'=>$request['email'],'confirmationUrl'=>$public.'?action=confirmSubscription&token='.$token,'expiresAt'=>gmdate('Y-m-d\TH:i:s\Z',$expires)]);
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
