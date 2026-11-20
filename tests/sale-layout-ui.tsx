// Isolated visual fixture: no store connection or real printing/payment operations.
import React from 'react'
import { createRoot } from 'react-dom/client'
import Sell from '../src/renderer/src/screens/Sell'
import { ApplicationDialogs } from '../src/renderer/src/dialogs'
import '../src/renderer/src/styles.css'
const boot:any={config:{mode:'till',tillName:'Front counter',serverUrl:'',apiKey:'',updateChannel:'stable',qbBridge:false},appVersion:'pending',isPackaged:false,lanAddresses:[]}
const settings={storeName:'Diamond P Lawn & Garden',taxRate:.0725,taxMode:'added',taxRates:[{id:'standard',name:'Sales tax',rate:.0725,active:true}],storeAddress:'24303 OK-66, Claremore, OK 74019',receiptFooter:'Thank you!'}
const product={id:1,name:'Husqvarna 450 Rancher Chainsaw',type:'inventory',sku:'HUS-450',barcode:'001',priceCents:44999,costCents:31000,orderCostCents:30000,onHand:6,taxable:true,useSerial:false,size:'20 in',attribute:'50.2 cc',active:true}
;(window as any).pos={onClosing:()=>()=>{},getBootInfo:async()=>boot,saveConfig:async(p:any)=>{Object.assign(boot.config,p);return boot},listPrinters:async()=>[],print:async()=>{throw Error('Fixture cannot print')}}
window.fetch=async(input:any)=>{const url=String(input);let body:any=[];if(url.endsWith('/api/settings'))body=settings;else if(url.endsWith('/api/held/count'))body=0;else if(url.includes('/api/products/lookup/'))body=product;else if(url.includes('/cost-summary'))body={productId:1,currentAvgCents:31000,orderCostCents:30000,lastReceivedCostCents:32000};else if(url.includes('/api/products'))body=url.includes('quickPick')?[]:[product];else if(url.includes('/api/customers'))body=[];return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}})}
createRoot(document.getElementById('root')!).render(<><Sell boot={boot}/><ApplicationDialogs/></>)
// Optional populated visual: same scan form and lookup path as the real application.
if(location.hash==='#populated')setTimeout(()=>{const input=document.getElementById('scan') as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'001');input.dispatchEvent(new Event('input',{bubbles:true}));setTimeout(()=>input.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})),50)},150)
