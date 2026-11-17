export interface MarketingConsentConfig { enabled:boolean; trackingEnabled:boolean; url:string; apiKey:string; clientId:string }
export interface MarketingConsentView { enabled:boolean; trackingEnabled:boolean; url:string; hasKey:boolean; clientId:string; cursor:number; lastSyncAt:string|null; error:string|null; suppressedCount:number; pendingCount:number; recent:{email:string;at:string;source:string}[] }
export interface MarketingSubscriber { customerId:number; name:string; email:string; consent:'Yes' }
