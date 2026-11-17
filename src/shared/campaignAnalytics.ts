export interface ActivityLocation {city:string;region:string;country:string;countryCode:string;latitude:number;longitude:number;source:'ipgeolocation.io'}
export interface GeoServiceStatus {enabled:boolean;keyConfigured:boolean;lastError:string|null;lastSuccessAt:string|null;dailyLookups:number;dailyLimit:number}
export interface CampaignAnalytics {
 campaignId:number;days:number|null;timeZone:string;generatedAt:string;geo:GeoServiceStatus|null
 totals:{trackedSent:number;openEvents:number;clickEvents:number;openedRecipients:number;clickedRecipients:number;mappedOpens:number;mappedClicks:number;unknownOpens:number;unknownClicks:number}
 timeline:{date:string;opens:number;clicks:number}[]
 hours:{hour:number;opens:number;clicks:number}[]
 locations:(ActivityLocation&{key:string;opens:number;clicks:number;recipients:number})[]
}
export function activityLocation(input:unknown):ActivityLocation|null {
 if(input===undefined||input===null)return null
 const a=input as ActivityLocation
 if(!a||typeof a!=='object'||a.source!=='ipgeolocation.io'||typeof a.latitude!=='number'||!Number.isFinite(a.latitude)||Math.abs(a.latitude)>90||typeof a.longitude!=='number'||!Number.isFinite(a.longitude)||Math.abs(a.longitude)>180||!['city','region','country','countryCode'].every(k=>typeof (a as any)[k]==='string'&&(a as any)[k].length<=100&&!/[\x00-\x1f\x7f]/.test((a as any)[k]))||!/^[A-Z]{2}$/.test(a.countryCode)||!a.country.trim())throw Error('Invalid activity location')
 return {city:a.city.trim(),region:a.region.trim(),country:a.country.trim(),countryCode:a.countryCode,latitude:Math.round(a.latitude*10)/10,longitude:Math.round(a.longitude*10)/10,source:'ipgeolocation.io'}
}
