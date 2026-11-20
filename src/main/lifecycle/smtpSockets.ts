import net from 'node:net'
const sockets=new Set<net.Socket>()
let stopped=false
export function resumeSmtpSockets(){stopped=false}
export function stopSmtpSockets(){stopped=true;for(const socket of sockets)socket.destroy(Object.assign(Error('Email connection interrupted during shutdown'),{code:'ECONNECTION'}))}
/** Nodemailer's documented socket hook; it still performs SSL/STARTTLS and certificate verification. */
export function smtpSocket(options:{host?:string;port?:number},callback:(error:Error|null,result?:{connection:net.Socket})=>void){
 if(stopped){callback(Object.assign(Error('Email services are stopping'),{code:'ECONNECTION'}));return}
 const socket=net.createConnection({host:options.host||'localhost',port:options.port||587});sockets.add(socket)
 let returned=false
 const timer=setTimeout(()=>socket.destroy(Object.assign(Error('Email connection timeout'),{code:'ETIMEDOUT'})),20000)
 socket.once('close',()=>{clearTimeout(timer);sockets.delete(socket)})
 socket.once('error',error=>{clearTimeout(timer);if(!returned){returned=true;callback(error)}})
 socket.once('connect',()=>{clearTimeout(timer);if(returned)return;returned=true;callback(null,{connection:socket})})
}
