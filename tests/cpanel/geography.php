<?php
declare(strict_types=1);
require __DIR__.'/../../extras/cpanel-marketing/public/geography.php';
function verify(bool $value,string $message):void {if(!$value)throw new RuntimeException($message);}
$db=new PDO('sqlite::memory:');$db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$db->exec('CREATE TABLE activity_events(id INTEGER PRIMARY KEY)');geographySchema($db);
$cfg=['api_key'=>str_repeat('a',64),'geo_enabled'=>true,'geo_api_key'=>'private-test-only','geo_daily_limit'=>3];$calls=0;$ips=[];
$lookup=function($ip,$key)use(&$calls,&$ips){$calls++;$ips[]=$ip;verify($key==='private-test-only','Private key mismatch');return ['ip'=>$ip,'location'=>['city'=>'Tulsa','state_prov'=>'Oklahoma','country_name'=>'United States','country_code2'=>'US','latitude'=>'36.153981','longitude'=>'-95.992775'],'other_private_field'=>'must-not-be-stored'];};
verify(geographyLocate($db,[...$cfg,'geo_enabled'=>false],['REMOTE_ADDR'=>'8.8.8.8'],$lookup)===null,'Disabled lookup');
verify(geographyLocate($db,$cfg,['REMOTE_ADDR'=>'127.0.0.1'],$lookup)===null,'Local IP must be skipped');
verify(geographyLocate($db,$cfg,['REMOTE_ADDR'=>'192.168.1.1'],$lookup)===null,'Private IP must be skipped');
$location=geographyLocate($db,$cfg,['REMOTE_ADDR'=>'8.8.8.8','HTTP_CF_CONNECTING_IP'=>'1.1.1.1'],$lookup);
verify($calls===1&&$ips===['8.8.8.8'],'Untrusted proxy header must be ignored');verify($location['latitude']===36.2&&$location['longitude']===-96.0,'Coordinates must be coarse');
geographyLocate($db,$cfg,['REMOTE_ADDR'=>'8.8.8.8'],$lookup);verify($calls===1,'Cache must avoid a second provider lookup');
$cache=$db->query('SELECT * FROM geo_cache')->fetchAll(PDO::FETCH_ASSOC);$json=json_encode($cache);verify(!str_contains($json,'8.8.8.8')&&!str_contains($json,'private-test-only')&&!str_contains($json,'must-not-be-stored'),'Cache must contain no raw IP/provider key/full response');verify((bool)preg_match('/^[a-f0-9]{64}$/D',$cache[0]['cache_key']),'Cache identity must be HMAC');
verify(geoInCidr('173.245.48.5','173.245.48.0/20'),'Trusted IPv4 CIDR');verify(!geoInCidr('8.8.8.8','173.245.48.0/20'),'Wrong IPv4 range');verify(geoInCidr('2606:4700:4700::1111','2606:4700::/32'),'IPv6 CIDR');verify(!geoInCidr('8.8.8.8','8.8.8.8/nope'),'Invalid prefix must be rejected');
geographyLocate($db,[...$cfg,'geo_trusted_proxy_cidrs'=>['173.245.48.0/20']],['REMOTE_ADDR'=>'173.245.48.5','HTTP_CF_CONNECTING_IP'=>'1.1.1.1'],$lookup);verify($ips[1]==='1.1.1.1','Explicitly trusted proxy must use client header');
$fail=function(){throw new RuntimeException('Location provider unavailable (HTTP 429)');};verify(geographyLocate($db,$cfg,['REMOTE_ADDR'=>'9.9.9.9'],$fail)===null,'Provider error must yield unknown');verify(str_contains(geographyStatus($db,$cfg)['lastError'],'429'),'Provider error status');
verify(geographyLocate($db,$cfg,['REMOTE_ADDR'=>'4.2.2.2'],$lookup)===null&&$calls===2,'Hard daily budget must prevent excess lookups');verify(geographyStatus($db,$cfg)['dailyLookups']===3,'Failed lookup still uses reserved budget');
verify(geographyData(['location'=>['country_name'=>'Unknown','country_code2'=>'US','latitude'=>999,'longitude'=>0]])===null,'Invalid coordinates must not produce fake marker');
verify(geographyData(['location'=>['country_name'=>'Unknown','country_code2'=>'ZZZ','latitude'=>0,'longitude'=>0]])===null,'Invalid country must not produce fake marker');
echo "PASS PHP geography: coarse coordinates, no raw-IP/key retention, cache, public-IP validation, explicit proxy trust, provider failure and daily budget\n";
