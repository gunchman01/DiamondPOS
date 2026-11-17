<?php
declare(strict_types=1);
// Included by index.php after the private database/configuration is validated.
function trackingSchema(PDO $db):void {
 $db->exec('CREATE TABLE IF NOT EXISTS deliveries(delivery_key TEXT PRIMARY KEY,email TEXT NOT NULL);CREATE TABLE IF NOT EXISTS tracking_tokens(hash TEXT PRIMARY KEY,delivery_key TEXT NOT NULL,kind TEXT NOT NULL,url TEXT);CREATE TABLE IF NOT EXISTS activity_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT NOT NULL UNIQUE,delivery_key TEXT NOT NULL,kind TEXT NOT NULL,at TEXT NOT NULL,url TEXT,token_hash TEXT NOT NULL);CREATE INDEX IF NOT EXISTS idx_activity_token ON activity_events(token_hash,at);');
}
function trackingUrl(mixed $value):string {
 if(!is_string($value)||strlen($value)>2048||preg_match('/[\x00-\x20\x7f]/',$value))throw new InvalidArgumentException('Invalid link');
 $u=parse_url($value);if(!$u||!in_array(strtolower($u['scheme']??''),['http','https'],true)||empty($u['host'])||isset($u['user'])||isset($u['pass']))throw new InvalidArgumentException('Invalid link');return $value;
}
function trackingPublic(PDO $db,string $action,array $cfg):never {
 $method=$_SERVER['REQUEST_METHOD']??'GET';if(!in_array($method,['GET','HEAD'],true))jsonOut(['ok'=>false,'error'=>'Use GET'],405);
 $token=(string)($_GET['token']??'');$row=false;
 if(preg_match('/^[a-f0-9]{64}$/D',$token)){$q=$db->prepare('SELECT t.*,d.email FROM tracking_tokens t JOIN deliveries d ON d.delivery_key=t.delivery_key WHERE t.hash=? AND t.kind=?');$q->execute([hash('sha256',$token),$action==='open'?'open':'click']);$row=$q->fetch(PDO::FETCH_ASSOC);}
 if(!$row){http_response_code(404);header('Content-Type: text/plain; charset=utf-8');echo 'Link not available';exit;}
 $agent=(string)($_SERVER['HTTP_USER_AGENT']??'');$purpose=(string)($_SERVER['HTTP_SEC_PURPOSE']??$_SERVER['HTTP_PURPOSE']??'');
 $automated=preg_match('/bot|spider|crawler|scanner|prefetch|preview|safelinks|urlscan/i',$agent)||preg_match('/prefetch|preview/i',$purpose);
 if($method==='GET'&&!$automated){
  // One observed request per token per minute; no IP address or user-agent is stored.
  // Unsubscribed addresses retain working links but generate no further engagement.
  $q=$db->prepare('SELECT 1 FROM suppressions WHERE email=?');$q->execute([$row['email']]);
  if(!$q->fetchColumn()){
   $q=$db->prepare('SELECT 1 FROM activity_events WHERE token_hash=? AND at>=? LIMIT 1');$q->execute([$row['hash'],gmdate('Y-m-d\TH:i:s\Z',time()-60)]);
   if(!$q->fetchColumn()){
    // Network lookup occurs outside the activity transaction; failure never breaks a click.
    $location=null;try{$location=geographyLocate($db,$cfg,$_SERVER);}catch(Throwable $ignored){error_log('DiamondPOS coarse location unavailable');}
    $db->beginTransaction();try{
     $q=$db->prepare('SELECT 1 FROM activity_events WHERE token_hash=? AND at>=? LIMIT 1');$q->execute([$row['hash'],gmdate('Y-m-d\TH:i:s\Z',time()-60)]);$duplicate=$q->fetchColumn();
     $q=$db->prepare('SELECT 1 FROM suppressions WHERE email=?');$q->execute([$row['email']]);$suppressed=$q->fetchColumn();
     if(!$duplicate&&!$suppressed){$q=$db->prepare('INSERT INTO activity_events(event_key,delivery_key,kind,at,url,token_hash,location_json) VALUES(?,?,?,?,?,?,?)');$q->execute([bin2hex(random_bytes(32)),$row['delivery_key'],$row['kind'],gmdate('Y-m-d\TH:i:s\Z'),$row['url'],$row['hash'],$location?json_encode($location):null]);}
     $db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();error_log('DiamondPOS activity record unavailable');}
   }
  }
 }
 if($action==='click'){
  // Destination comes only from authenticated preparation, never a public URL parameter.
  $url=trackingUrl($row['url']);header('Location: '.$url,true,302);exit;
 }
 header('Content-Type: image/gif');if($method==='GET')echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');exit;
}
function prepareTracking(PDO $db,array $body,string $public):never {
 $email=emailKey($body['email']??null);$key=$body['deliveryKey']??'';$links=$body['links']??null;
 if(!is_string($key)||!preg_match('/^[a-f0-9]{64}$/D',$key)||!is_array($links)||!array_is_list($links)||count($links)>100)throw new InvalidArgumentException('Invalid delivery');
 $links=array_values(array_unique(array_map('trackingUrl',$links)));
 $db->beginTransaction();try{
  $q=$db->prepare('SELECT 1 FROM suppressions WHERE email=?');$q->execute([$email]);if($q->fetchColumn()){$db->rollBack();jsonOut(['ok'=>true,'suppressed'=>true]);}
  $q=$db->prepare('SELECT email FROM deliveries WHERE delivery_key=?');$q->execute([$key]);$existing=$q->fetchColumn();if($existing!==false&&$existing!==$email)throw new InvalidArgumentException('Delivery address mismatch');
  $q=$db->prepare('INSERT OR IGNORE INTO deliveries(delivery_key,email) VALUES(?,?)');$q->execute([$key,$email]);
  $make=function(string $kind,?string $url)use($db,$key,$public):string{$token=bin2hex(random_bytes(32));$q=$db->prepare('INSERT INTO tracking_tokens(hash,delivery_key,kind,url) VALUES(?,?,?,?)');$q->execute([hash('sha256',$token),$key,$kind,$url]);return $public.'?action='.$kind.'&token='.$token;};
  $pixel=$make('open',null);$clicks=[];foreach($links as $url)$clicks[$url]=$make('click',$url);
  $db->commit();jsonOut(['ok'=>true,'version'=>1,'suppressed'=>false,'pixelUrl'=>$pixel,'clickUrls'=>(object)$clicks]);
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function activityFeed(PDO $db,array $body,array $cfg):never {
 $cursor=$body['cursor']??null;if(!is_int($cursor)||$cursor<0)throw new InvalidArgumentException('Invalid activity cursor');
 $max=(int)$db->query('SELECT COALESCE(MAX(id),0) FROM activity_events')->fetchColumn();if($cursor>$max)jsonOut(['ok'=>false,'error'=>'Activity history restored; replay activity history in POS'],409);
 $q=$db->prepare('SELECT id,event_key AS eventKey,delivery_key AS deliveryKey,kind,at,url,location_json FROM activity_events WHERE id>? ORDER BY id LIMIT 201');$q->execute([$cursor]);$events=$q->fetchAll(PDO::FETCH_ASSOC);foreach($events as &$event){$event['location']=$event['location_json']?json_decode($event['location_json'],true):null;unset($event['location_json']);}unset($event);jsonOut(['ok'=>true,'geo'=>geographyStatus($db,$cfg),'version'=>1,'events'=>array_slice($events,0,200),'hasMore'=>count($events)>200]);
}
