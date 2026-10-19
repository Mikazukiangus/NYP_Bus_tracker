import { config } from '../config/server.ts';

console.log('Configuration valid.');
console.log(`LTA live data: ${config.lta.accountKey ? 'key configured' : 'key missing (offline/degraded mode)'}.`);
console.log(`NEA access: ${config.weather.apiKey ? 'API key configured' : 'keyless'}.`);
