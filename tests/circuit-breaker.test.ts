import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCircuitBreaker, CircuitOpenError, DependencyHttpError, InvalidDependencyResponseError, readDependencyJson, DEFAULT_CIRCUIT_SETTINGS } from '../shared/http/circuitBreaker';
import { RetryableNetworkError, waitForRetry } from '../shared/http/readRetry';
import { SsrfBlockedError } from '../security/ssrf';
import { createConfig, createPublicConfig } from '../config/schema';
import { createArrivalService } from '../server/lta/arrivals';
import { createIncidentService } from '../server/lta/incidents';
import { createLtaClient } from '../server/lta/client';
import { createDatasetStore } from '../server/lta/datasets';
import { createWeatherService } from '../server/weather/service';
import { createOneMapClient } from '../src/features/places/data/oneMapClient';
import { neaFixture } from './fixtures/nea';
import { redact } from '../security/redact';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((r,j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const failure = async () => { throw new DependencyHttpError(503); };
const retry = { attempts: 2, baseDelayMs: 0, maxDelayMs: 0 };
const settings = () => createConfig({ LTA_ACCOUNT_KEY: 'fixture', LTA_PAGE_RETRY_DELAY_MS: '0' });

test('three failures within one minute open for 30 seconds; open calls fail without running work', async () => {
  let time = 100000;
  const circuit = createCircuitBreaker(undefined, () => time);
  for (let i = 0; i < 3; i++) { await assert.rejects(circuit.run(failure), DependencyHttpError); time += 1000; }
  assert.equal(circuit.snapshot().state, 'open');
  assert.equal(circuit.canRequest(), false);
  await assert.rejects(circuit.run(async () => assert.fail('must short-circuit')), error => {
    assert.ok(error instanceof CircuitOpenError); assert.equal(error.retryAfterMs, 29000); assert.equal(error.cause, undefined); return true;
  });
  time += 29000;
  assert.equal(circuit.canRequest(), true);
  assert.equal(await circuit.run(async probe => { assert.equal(probe,true); return 'recovered'; }), 'recovered');
  assert.deepEqual(circuit.snapshot(), { state: 'closed', failures: 0, retryAfterMs: 0 });
});

test('old failures expire and a validated success resets the consecutive failure count', async () => {
  let time = 0;
  const circuit = createCircuitBreaker(undefined, () => time);
  await assert.rejects(circuit.run(failure));
  time = 60001;
  await assert.rejects(circuit.run(failure));
  assert.equal(circuit.snapshot().failures,1);
  await circuit.run(async () => []);
  assert.equal(circuit.snapshot().failures,0);
  await assert.rejects(circuit.run(failure)); await assert.rejects(circuit.run(failure));
  assert.equal(circuit.snapshot().state,'closed');
});

test('only one half-open operation is admitted; a failed probe restarts cooldown', async () => {
  let time = 0;
  const circuit = createCircuitBreaker({ ...DEFAULT_CIRCUIT_SETTINGS, failureThreshold: 1 }, () => time);
  await assert.rejects(circuit.run(failure)); time = 30000;
  const gate = deferred<string>();
  const probe = circuit.run(async isProbe => { assert.ok(isProbe); return gate.promise; });
  assert.equal(circuit.snapshot().state,'half-open'); assert.equal(circuit.canRequest(),false);
  for(let i=0;i<5;i++) await assert.rejects(circuit.run(async () => assert.fail('duplicate probe')),CircuitOpenError);
  gate.reject(new RetryableNetworkError()); await assert.rejects(probe);
  assert.equal(circuit.snapshot().state,'open'); assert.equal(circuit.snapshot().retryAfterMs,30000);
  time += 29999; assert.equal(circuit.canRequest(),false);
  time++; await circuit.run(async () => 'ok'); assert.equal(circuit.snapshot().state,'closed');
});

test('late closed-state completions cannot close an opened circuit or overwrite a newer recovery', async () => {
  let time = 0;
  const circuit = createCircuitBreaker({ ...DEFAULT_CIRCUIT_SETTINGS, failureThreshold: 1 }, () => time);
  const oldSuccess = deferred<string>(), oldFailure = deferred<string>();
  const a = circuit.run(() => oldSuccess.promise), b = circuit.run(() => oldFailure.promise);
  await assert.rejects(circuit.run(failure));
  oldSuccess.resolve('old'); assert.equal(await a,'old'); assert.equal(circuit.snapshot().state,'open');
  time = 30000; await circuit.run(async () => 'new');
  oldFailure.reject(new DependencyHttpError(503)); await assert.rejects(b);
  assert.deepEqual(circuit.snapshot(),{state:'closed',failures:0,retryAfterMs:0});
});

test('client/auth/security errors and caller cancellation do not trip; dependency timeouts and invalid data do', async () => {
  const circuit = createCircuitBreaker();
  for(const error of [new DependencyHttpError(400),new DependencyHttpError(401),new DependencyHttpError(403),new DependencyHttpError(404),new SsrfBlockedError(),new Error('TLS refused'),new DOMException('cancel','AbortError')]) {
    for(let i=0;i<3;i++) await assert.rejects(circuit.run(async()=>{throw error;}));
    assert.equal(circuit.snapshot().failures,0);
  }
  const cancelled = new AbortController(); cancelled.abort(new Error('user cancelled'));
  await assert.rejects(circuit.run(async()=>assert.fail('already cancelled'),cancelled.signal));
  assert.equal(circuit.snapshot().failures,0);
  await assert.rejects(circuit.run(async()=>{throw new InvalidDependencyResponseError();}));
  await assert.rejects(circuit.run(async()=>{throw new DOMException('timeout','TimeoutError');}));
  const signal=AbortSignal.timeout(10);
  await assert.rejects(circuit.run(()=>waitForRetry(100,signal),signal),{name:'TimeoutError'});
  assert.equal(circuit.snapshot().state,'open');
});

test('an abandoned probe releases its slot without counting cancellation or claiming success', async () => {
  let time = 0;
  const circuit = createCircuitBreaker({ ...DEFAULT_CIRCUIT_SETTINGS, failureThreshold:1 },()=>time);
  await assert.rejects(circuit.run(failure)); time=30000;
  const controller=new AbortController();
  await assert.rejects(circuit.run(async()=>{controller.abort();throw controller.signal.reason;},controller.signal));
  assert.equal(circuit.snapshot().state,'open'); assert.equal(circuit.canRequest(),true);
  assert.equal(circuit.snapshot().failures,1);
  await circuit.run(async probe=>assert.equal(probe,true)); assert.equal(circuit.snapshot().state,'closed');
});

test('wall clock rollback does not leave an open circuit stuck indefinitely', async () => {
  let time=100000;
  const circuit=createCircuitBreaker({ ...DEFAULT_CIRCUIT_SETTINGS,failureThreshold:1 },()=>time);
  await assert.rejects(circuit.run(failure)); time=1000;
  assert.equal(circuit.snapshot().retryAfterMs,30000);
  time=31000;assert.equal(circuit.canRequest(),true);await circuit.run(async()=>true);
  assert.equal(circuit.snapshot().state,'closed');
});

test('validated body consumption is included; invalid JSON/schema/content type never counts as recovery', async () => {
  for(const response of [() => new Response('{',{headers:{'Content-Type':'application/json'}}),() => new Response('<html>'),() => Response.json({broken:true})]) {
    const circuit=createCircuitBreaker({...DEFAULT_CIRCUIT_SETTINGS,failureThreshold:1});
    await assert.rejects(circuit.run(()=>readDependencyJson(response(),raw=>{assert.ok((raw as {ok?:boolean}).ok);return raw;})),InvalidDependencyResponseError);
    assert.equal(circuit.snapshot().state,'open');
  }
});

test('LTA arrival failures count after retries, fast-fail through simulations, and probe with one wire request', async () => {
  let time=100000,calls=0,healthy=false;
  const config=settings();
  const service=createArrivalService(config.lta,{retry,now:()=>time,request:async()=>{
    calls++;return healthy?Response.json({BusStopCode:'55329',Services:[]}):new Response('',{status:503});
  }});
  for(let i=0;i<3;i++) assert.equal((await service.arrivals('55329')).kind,'simulated');
  assert.equal(calls,6);
  assert.equal((await service.arrivals('55329')).body.source,'FALLBACK_SIMULATED');assert.equal(calls,6);
  // A different service endpoint and a separate service owner remain independent.
  const incidents=createIncidentService(config.lta,{request:async()=>Response.json({value:[]})});
  assert.equal((await incidents.incidents()).kind,'ok');
  const isolated=createArrivalService(config.lta,{request:async()=>Response.json({BusStopCode:'55329',Services:[]})});
  assert.equal((await isolated.arrivals('55329')).kind,'live');
  time+=30000;assert.equal((await service.arrivals('55329')).kind,'simulated');assert.equal(calls,7);
  healthy=true;assert.equal((await service.arrivals('55329')).kind,'simulated');assert.equal(calls,7);
  time+=30000;assert.equal((await service.arrivals('55329')).kind,'live');assert.equal(calls,8);
  assert.equal((await service.arrivals('55329')).kind,'live');assert.equal(calls,9);
});

test('invalid arrival data trips without retry; incident outages fast-fail through their existing unavailable result', async () => {
  let calls=0;
  const config=settings();
  const arrivals=createArrivalService(config.lta,{retry,request:async()=>{calls++;return Response.json({invalid:'private value'});}});
  for(let i=0;i<4;i++)assert.equal((await arrivals.arrivals('55329')).kind,'simulated');
  assert.equal(calls,3);
  calls=0;
  const incidents=createIncidentService(config.lta,{retry,request:async()=>{calls++;return new Response('',{status:502});}});
  for(let i=0;i<4;i++)assert.deepEqual(await incidents.incidents(),{kind:'unavailable'});
  assert.equal(calls,6);
});

test('LTA collection breaker stops repeated loads and probes pagination serially without retry amplification',async()=>{
  let time=0,calls=0,healthy=false,active=0,maxActive=0;
  const config=settings();
  const client=createLtaClient({...config.lta,pageConcurrency:3,pageAttempts:2},async(input)=>{
    calls++;active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;
    if(!healthy)return new Response('',{status:503});
    const skip=Number(new URL(String(input)).searchParams.get('$skip'));
    return Response.json({value:Array.from({length:Math.max(0,Math.min(500,1200-skip))},(_,i)=>({n:skip+i}))});
  },()=>time);
  for(let i=0;i<3;i++)await assert.rejects(client.fetchAll('BusStops','fixture'));
  assert.equal(calls,18);
  await assert.rejects(client.fetchAll('BusStops','fixture'),CircuitOpenError);assert.equal(calls,18);
  time=30000;healthy=true;maxActive=0;
  const rows=await client.fetchAll<{n:number}>('BusStops','fixture');
  assert.equal(rows.length,1200);assert.equal(rows[500].n,500);assert.equal(rows[1000].n,1000);
  assert.equal(maxActive,1);assert.equal(calls,21);
  maxActive=0;await client.fetchAll('BusStops','fixture');assert.equal(maxActive,3);
});

test('speculative page failures beyond the end never trip a successfully loaded collection',async()=>{
  const config=settings();let calls=0;
  const client=createLtaClient({...config.lta,pageConcurrency:4,circuit:{...config.lta.circuit,failureThreshold:1}},async(input)=>{
    calls++;const skip=Number(new URL(String(input)).searchParams.get('$skip'));
    if(skip>=1500)return new Response('',{status:503});
    return Response.json({value:Array.from({length:Math.max(0,Math.min(500,1200-skip))},()=>({}))});
  });
  for(let i=0;i<3;i++)assert.equal((await client.fetchAll('BusStops','fixture')).length,1200);
  assert.equal(calls,18);
});

test('NEA open datasets consume no quota slots and allow other datasets to fill',async()=>{
  let time=100000;
  const paths:string[]=[];
  const config=createConfig().weather;
  const bad=new Set(['two-hr-forecast','air-temperature','rainfall','psi','pm25']);
  const service=createWeatherService(config,'https://fixture.example',{now:()=>time,request:async(input)=>{
    const key=new URL(String(input)).pathname.slice(1);paths.push(key);
    return bad.has(key)?new Response('',{status:503}):Response.json(neaFixture());
  }});
  for(let i=0;i<3;i++){await service.snapshot();time+=config.rateWindowMs+1;}
  assert.equal(paths.length,15);
  const snapshot=await service.snapshot();
  assert.equal(paths.length,20);
  assert.deepEqual(paths.slice(15),['relative-humidity','twenty-four-hr-forecast','uv','weather','weather']);
  assert.ok(snapshot.forecast24h);assert.ok(snapshot.humidity);assert.ok(snapshot.missing.includes('forecast2h'));
});

test('NEA keeps stale readings while open and admits one dataset recovery probe without wasting concurrent quota',async()=>{
  let time=100000,failed=false,calls=0,hold=false;
  const gate=deferred<Response>();
  const config={...createConfig().weather,apiKey:'fixture',keyedBudget:12};
  const service=createWeatherService(config,'https://fixture.example',{now:()=>time,request:async(input)=>{
    calls++;if(new URL(String(input)).pathname==='/two-hr-forecast'){
      if(hold)return gate.promise;if(failed)return new Response('',{status:503});
    }
    return Response.json(neaFixture());
  }});
  const before=await service.snapshot();failed=true;time+=config.summaryTtlMs+1;
  for(let i=0;i<3;i++){await service.snapshot();if(i<2)time+=config.rateWindowMs+1;}
  const previousCalls=calls;
  const blocked=await service.snapshot();assert.equal(calls,previousCalls);
  assert.deepEqual(blocked.forecast2h,before.forecast2h);assert.equal(blocked.fetchedAt.forecast2h,before.fetchedAt.forecast2h);
  assert.ok(blocked.stale.includes('forecast2h'));assert.deepEqual(blocked.missing,[]);
  time+=30000;hold=true;failed=false;
  const first=service.snapshot();
  const overlapping=service.snapshot();await Promise.resolve();assert.equal(calls,previousCalls+1);
  gate.resolve(Response.json(neaFixture()));const recovered=await first;
  assert.deepEqual(await overlapping,recovered);
  assert.ok(!recovered.stale.includes('forecast2h'));assert.notEqual(recovered.fetchedAt.forecast2h,before.fetchedAt.forecast2h);
});

test('OneMap breaker spans search text, suppresses repeat outages, and releases a cancelled recovery probe',async()=>{
  let time=100000,calls=0,mode:'fail'|'hold'|'ok'='fail';
  const client=createOneMapClient({url:'https://fixture.example/search',timeoutMs:1000},async(_input,init)=>{
    calls++;
    if(mode==='hold')return new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true}));
    return mode==='fail'?new Response('',{status:503,headers:{'Retry-After':'120'}}):Response.json({results:[]});
  },()=>time);
  for(const q of ['NYP','AMK','YCK','Bishan'])assert.equal(await client.search(q),null);
  assert.equal(calls,3);
  time+=30000;mode='hold';const controller=new AbortController();
  const pending=client.search('probe',controller.signal);
  assert.equal(await client.search('another query'),null);assert.equal(calls,4);
  controller.abort();assert.equal(await pending,null);
  mode='ok';assert.deepEqual(await client.search('recovery'),[]);assert.equal(calls,5);
  assert.deepEqual(await client.search('healthy'),[]);assert.equal(calls,6);
});

test('circuit settings are validated centrally and server settings remain outside the public projection',()=>{
  const config=createConfig();
  assert.deepEqual(config.lta.circuit,DEFAULT_CIRCUIT_SETTINGS);assert.deepEqual(config.weather.circuit,DEFAULT_CIRCUIT_SETTINGS);assert.deepEqual(config.public.oneMapCircuit,DEFAULT_CIRCUIT_SETTINGS);
  for(const [key,value]of Object.entries({LTA_CIRCUIT_FAILURES:'0',NEA_CIRCUIT_OPEN_MS:'0',VITE_ONEMAP_CIRCUIT_WINDOW_MS:'999',NEA_CIRCUIT_WINDOW_MS:'600001'})){
    assert.throws(()=>createConfig({[key]:value}),new RegExp(key));
  }
  assert.throws(()=>createPublicConfig({VITE_ONEMAP_CIRCUIT_FAILURES:'21'}));
  assert.ok(!JSON.stringify(config.public).includes('LTA_CIRCUIT'));
  assert.throws(()=>createCircuitBreaker({...DEFAULT_CIRCUIT_SETTINGS,openMs:NaN}));
});

test('collection recovery requires valid rows before dataset indexes are built',async()=>{
  let time=100000,stopsCalls=0,healthy=false;
  const config=settings();
  const store=createDatasetStore({...config.lta,pageConcurrency:1},async(input)=>{
    const stops=String(input).includes('/BusStops?');if(stops)stopsCalls++;
    return Response.json({value:stops&&!healthy?[{BusStopCode:'bad'}]:[]});
  },()=>time);
  for(let i=0;i<3;i++)await assert.rejects(store.getDatasets('fixture'),InvalidDependencyResponseError);
  await assert.rejects(store.getDatasets('fixture'),CircuitOpenError);assert.equal(stopsCalls,3);
  time+=30000;healthy=true;assert.equal((await store.getDatasets('fixture')).stops.size,0);assert.equal(stopsCalls,4);
});

test('breaker diagnostics redact error fields instead of exposing provider metadata',()=>{
  for(const [error,kind]of [[new CircuitOpenError(30000),'circuit_open'],[new InvalidDependencyResponseError(),'invalid_response']]as const){
    Object.assign(error,{providerValue:'private fixture',cause:new Error('private cause')});
    assert.deepEqual(redact({error}),{error:{kind}});
  }
});
