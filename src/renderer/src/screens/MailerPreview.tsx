import { memo, useMemo } from 'react'
import { mailerHtml } from '../../../shared/mailerTemplate'
// Isolated from urgent name/subject/message input renders, particularly with large flyers.
export default memo(function MailerPreview(props:{subject:string;message:string;flyer:string|null;storeName:string;storeAddress:string;replyTo:string;recipientName:string}){
 const html=useMemo(()=>{
  const content=mailerHtml({storeName:props.storeName,storeAddress:props.storeAddress||'(add the store address in Settings)',replyTo:props.replyTo||'your-store@example.com',subject:props.subject||'(subject)',message:props.message,flyerSrc:props.flyer,recipientName:props.recipientName})
  return content.slice(content.indexOf('<body'),content.lastIndexOf('</body>')).replace(/^<body[^>]*>/,'')
 },[props.subject,props.message,props.flyer,props.storeName,props.storeAddress,props.replyTo,props.recipientName])
 return <div className="email-preview"><div className="email-subject"><span className="muted">Subject:</span> <b>{props.subject||'(subject)'}</b></div><div className="email-body" dangerouslySetInnerHTML={{__html:html}}/></div>
})
