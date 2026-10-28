import { config } from '../config/server.ts';
import { logger } from '../security/logger.ts';

logger.info('config.valid', { ltaAccess: config.lta.accountKey ? 'configured' : 'offline', neaAccess: config.weather.apiKey ? 'configured' : 'keyless' });
