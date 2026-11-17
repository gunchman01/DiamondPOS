<?php
declare(strict_types=1);
function geographySchema(PDO $db):void {
 $names=array_column($db->query('PRAGMA table_info(activity_events)')->fetchAll(PDO::FETCH_ASSOC),'name');if(!in_array('location_json',$names,true))$db->exec('ALTER TABLE activity_events ADD COLUMN location_json TEXT');
 $db->exec('CREATE TABLE IF NOT EXISTS geo_cache(cache_key TEXT PRIMARY KEY,expires INTEGER NOT NULL,location_json TEXT);CREATE TABLE IF NOT EXISTS geo_daily(day TEXT PRIMARY KEY,n INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS geo_status(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);');
}
function geographyNote(PDO $db,?string $error,bool $success=false):void {
 $old=$db->query('SELECT value FROM geo_status WHERE id=1')->fetchColumn();$state=$old?json_decode($old,true):[];$state['lastError']=$error;if($success)$state['lastSuccessAt']=gmdate('Y-m-d\TH:i:s\Z');$q=$db->prepare('INSERT INTO geo_status(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value');$q->execute([json_encode($state)]);
}
function geoLimit(array $cfg):int {return max(1,min(1000,(int)($cfg['geo_daily_limit']??900)));}
function geographyStatus(PDO $db,array $cfg):array {
 $q=$db->prepare('SELECT n FROM geo_daily WHERE day=?');$q->execute([gmdate('Y-m-d')]);$n=(int)$q->fetchColumn();$value=$db->query('SELECT value FROM geo_status WHERE id=1')->fetchColumn();$s=$value?json_decode($value,true):[];$enabled=($cfg['geo_enabled']??false)===true;
 return ['enabled'=>$enabled,'keyConfigured'=>!empty($cfg['geo_api_key']),'lastError'=>$enabled?($s['lastError']??null):null,'lastSuccessAt'=>$s['lastSuccessAt']??null,'dailyLookups'=>$n,'dailyLimit'=>geoLimit($cfg)];
}
function geoInCidr(string $ip,string $cidr):bool {
 $parts=explode('/',$cidr);if(count($parts)>2||(isset($parts[1])&&!preg_match('/^[0-9]+$/D',$parts[1])))return false;$a=@inet_pton($ip);$b=@inet_pton($parts[0]);if($a===false||$b===false||strlen($a)!==strlen($b))return false;$bits=isset($parts[1])&&preg_match('/^[0-9]+$/D',$parts[1])?(int)$parts[1]:strlen($a)*8;if($bits<0||$bits>strlen($a)*8)return false;$bytes=intdiv($bits,8);$extra=$bits%8;return substr($a,0,$bytes)===substr($b,0,$bytes)&&(!$extra||((ord($a[$bytes])^ord($b[$bytes]))&(255<<(8-$extra)))===0);
}
function geographyIp(array $server,array $cfg):?string {
 $ip=(string)($server['REMOTE_ADDR']??'');$trusted=false;
 foreach(array_slice((array)($cfg['geo_trusted_proxy_cidrs']??[]),0,64) as $cidr)if(is_string($cidr)&&geoInCidr($ip,$cidr)){$trusted=true;break;}
 if($trusted&&isset($server['HTTP_CF_CONNECTING_IP']))$ip=(string)$server['HTTP_CF_CONNECTING_IP'];
 if(str_starts_with(strtolower($ip),'::ffff:'))$ip=substr($ip,7);
 if(!filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE))return null;$packed=@inet_pton($ip);return $packed===false?null:inet_ntop($packed);
}
function geographyData(mixed $response):?array {
 $g=is_array($response)?($response['location']??null):null;if(!is_array($g)||!is_numeric($g['latitude']??null)||!is_numeric($g['longitude']??null))return null;$lat=(float)$g['latitude'];$lon=(float)$g['longitude'];$code=strtoupper((string)($g['country_code2']??''));
 if(!is_finite($lat)||!is_finite($lon)||abs($lat)>90||abs($lon)>180||!preg_match('/^[A-Z]{2}$/D',$code))return null;
 $clean=function($s):string{$v=preg_replace('/[\x00-\x1f\x7f]/','',substr(is_string($s)?$s:'',0,100));return preg_match('//u',$v)?trim($v):'';};$country=$clean($g['country_name']??'');if($country==='')return null;
 return ['city'=>$clean($g['city']??''),'region'=>$clean($g['state_prov']??''),'country'=>$country,'countryCode'=>$code,'latitude'=>round($lat,1),'longitude'=>round($lon,1),'source'=>'ipgeolocation.io'];
}
function geographyLookup(string $ip,string $key):mixed {
 if(!function_exists('curl_init'))throw new RuntimeException('Enable PHP cURL for location lookup');
 $url='https://api.ipgeolocation.io/v3/ipgeo?'.http_build_query(['apiKey'=>$key,'ip'=>$ip]);$curl=curl_init($url);curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT_MS=>700,CURLOPT_TIMEOUT_MS=>1500,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);$body=curl_exec($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
 if($body===false||$status!==200)throw new RuntimeException('Location provider unavailable (HTTP '.$status.')');if(strlen($body)>65536)throw new RuntimeException('Location response too large');return json_decode($body,true,64,JSON_THROW_ON_ERROR);
}
function geographyLocate(PDO $db,array $cfg,array $server,?callable $lookup=null):?array {
 if(($cfg['geo_enabled']??false)!==true)return null;$key=(string)($cfg['geo_api_key']??'');if($key===''){geographyNote($db,'Add the private geolocation API key');return null;}
 $ip=geographyIp($server,$cfg);if($ip===null)return null;$day=gmdate('Y-m-d');$hash=hash_hmac('sha256',$day."\0".$ip,(string)$cfg['api_key']);
 $q=$db->prepare('SELECT location_json FROM geo_cache WHERE cache_key=? AND expires>?');$q->execute([$hash,time()]);$cached=$q->fetch(PDO::FETCH_ASSOC);if($cached)return $cached['location_json']?json_decode($cached['location_json'],true):null;
 $db->beginTransaction();try{$q=$db->prepare('INSERT OR IGNORE INTO geo_daily(day,n) VALUES(?,0)');$q->execute([$day]);$q=$db->prepare('UPDATE geo_daily SET n=n+1 WHERE day=? AND n<?');$q->execute([$day,geoLimit($cfg)]);$allowed=$q->rowCount()>0;$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 if(!$allowed){geographyNote($db,'Daily location lookup budget reached; new activity remains unmapped');return null;}
 try{$location=geographyData(($lookup??'geographyLookup')($ip,$key));if(!$location)throw new RuntimeException('Location provider returned no valid coarse location');geographyNote($db,null,true);$expires=time()+86400;}catch(Throwable $e){$location=null;$expires=time()+300;geographyNote($db,$e instanceof RuntimeException?$e->getMessage():'Location lookup failed');}
 $q=$db->prepare('INSERT INTO geo_cache(cache_key,expires,location_json) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET expires=excluded.expires,location_json=excluded.location_json');$q->execute([$hash,$expires,$location?json_encode($location):null]);$db->exec('DELETE FROM geo_cache WHERE expires<'.time());return $location;
}
