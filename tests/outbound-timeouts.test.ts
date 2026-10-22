import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Agent } from 'undici';
import { createServer } from 'node:http';
import { parseHTML } from 'linkedom';
import { createSafeFetcher } from '../security/ssrf.ts';
import { createConfig } from '../config/schema.ts';
import { boundImageRequest } from '../src/features/map/imageDeadline.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const settings = { timeoutMs: 20, connectTimeoutMs: 1000 };
test('guarded fetch adds deadlines to bare and Request inputs while retaining caller cancellation', async () => {
  const client = createSafeFetcher(undefined, settings);
  const signals: AbortSignal[] = [];
  globalThis.fetch = async (_url, options) => { signals.push(options!.signal!); return Response.json({ ok: true }); };
  try {
    await client.fetch('https://public.example');
    await client.fetch(new Request('https://public.example'));
    const controller = new AbortController();
    await client.fetch('https://public.example', {signal:controller.signal});
    controller.abort();
    assert.equal(signals[2].aborted,true);
    await delay(40);
    for (const signal of signals.slice(0,2)) { assert.equal(signal.aborted,true); assert.equal(signal.reason.name,'TimeoutError'); }
  } finally { await client.close(); }
});

test('an explicit longer request budget stays finite and overrides only the default budget', async () => {
  const client = createSafeFetcher(undefined, settings);
  let signal!: AbortSignal;
  globalThis.fetch = async (_url, options) => { signal=options!.signal!; assert.ok(!('timeoutMs' in options!)); return Response.json({}); };
  try {
    await client.fetch('https://public.example', {timeoutMs:100});
    await delay(40); assert.equal(signal.aborted,false);
    await delay(80); assert.equal(signal.aborted,true);
    for(const timeoutMs of [0,-1,Infinity,NaN,1500001]) await assert.rejects(client.fetch('https://public.example',{timeoutMs}),/Invalid outbound timeout/);
  } finally { await client.close(); }
});

test('a timeout covers native response-body consumption after headers arrive', async () => {
  let closed=false;
  const server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{"ok":');res.on('close',()=>{closed=true;});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const fixtureAgent=new Agent();
  // Only this isolated fixture redirects network I/O to its controlled local server.
  globalThis.fetch=(_input,options)=>originalFetch(`http://127.0.0.1:${address.port}`,{...options,dispatcher:fixtureAgent} as RequestInit);
  const client=createSafeFetcher(undefined,{timeoutMs:120,connectTimeoutMs:1000});
  try {
    const response=await client.fetch('https://public.example/slow-body');
    assert.equal(response.status,200);
    await assert.rejects(response.json(),error=>error instanceof Error && ['TimeoutError','AbortError'].includes(error.name));
    await delay(20);assert.equal(closed,true);
  } finally { await client.close();await fixtureAgent.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

test('map image timeout stops waiting once and cleans up success, error and removed images', async () => {
  const {document,Event}=parseHTML('<html></html>');
  const pending=document.createElement('img') as unknown as HTMLImageElement;
  let failures=0;
  const cancel=boundImageRequest(pending,15,error=>{assert.match(error!.message,/timed out/); failures++;});
  pending.src='https://public.example/stalled.png';
  await delay(35); assert.equal(failures,1); assert.ok(pending.src.startsWith('data:'));
  pending.dispatchEvent(new Event('load')); cancel(); assert.equal(failures,1);
  for(const eventName of ['load','error']){
    const image=document.createElement('img') as unknown as HTMLImageElement;
    let calls=0;
    boundImageRequest(image,15,error=>{calls++;assert.equal(Boolean(error),eventName==='error');});
    image.src='https://public.example/image.png';image.dispatchEvent(new Event(eventName));
    await delay(25);assert.equal(calls,1);
  }
  const removed=document.createElement('img') as unknown as HTMLImageElement;
  const dispose=boundImageRequest(removed,15,()=>assert.fail('removed image must not invoke completion'));
  removed.src='https://public.example/removed.png';dispose();dispose();await delay(25);
  assert.ok(removed.src.startsWith('data:'));
});

test('outbound settings, map images and CI webhook retain bounded defaults', () => {
  const config=createConfig();
  assert.deepEqual(config.outbound,{timeoutMs:30000,connectTimeoutMs:10000});
  assert.equal(config.public.timeouts.mapImageMs,15000);
  assert.ok(config.shapes.timeoutMs>config.outbound.timeoutMs);
  for(const key of ['OUTBOUND_TIMEOUT_MS','OUTBOUND_CONNECT_TIMEOUT_MS','VITE_MAP_IMAGE_TIMEOUT_MS']) assert.throws(()=>createConfig({[key]:'0'}),new RegExp(key));
  const root=path.resolve(import.meta.dirname,'..');
  const workflow=readFileSync(path.join(root,'.github/workflows/refresh-data.yml'),'utf8');
  assert.match(workflow,/curl --connect-timeout 10 --max-time 30 -fsS -X POST/);
  assert.ok(!readFileSync(path.join(root,'index.html'),'utf8').includes('unpkg.com'));
  assert.match(readFileSync(path.join(root,'src/features/map/useLeafletMap.ts'),'utf8'),/import 'leaflet\/dist\/leaflet.css'/);
  assert.match(readFileSync(path.join(root,'scripts/build-route-shapes.ts'),'utf8'),/timeoutMs: Math.min\(config.shapes.timeoutMs, remaining\)/);
});

test('every direct HTTP fetch boundary supplies a signal or uses guarded fetch', () => {
  const root=path.resolve(import.meta.dirname,'..');
  function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):/\.tsx?$/.test(entry.name)?[path.join(dir,entry.name)]:[]);}
  for(const file of ['api','server','scripts','src','security'].flatMap(dir=>files(path.join(root,dir)))){
    const source=readFileSync(file,'utf8');
    for(const match of source.matchAll(/(?<![\w.])\b(fetch|request)\s*\(/g)){
      if(source.slice(source.lastIndexOf('\n',match.index!)+1,match.index).trimStart().startsWith('//'))continue;
      const start=match.index!+match[0].length;
      // Scan this call's matching parentheses while skipping quoted strings/templates.
      let depth=1, quote='', end=start;
      for(;end<source.length&&depth;end++){
        const c=source[end];
        if(quote){if(c==='\\')end++;else if(c===quote)quote='';continue;}
        if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
        if(c==='(')depth++;if(c===')')depth--;
      }
      const call=source.slice(start,end);
      const delegation=/^\s*\.\.\.args\s*\)/.test(call);
      const guarded=file===path.join(root,'security/ssrf.ts');
      assert.ok(delegation||guarded||/\bsignal\s*:/.test(call),`${path.relative(root,file)} lacks a timeout signal`);
    }
  }
});
