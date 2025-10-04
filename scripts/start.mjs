import 'dotenv/config';
import { register } from 'node:module';

register('ts-node/esm', import.meta.url);

await import(new URL('../src/index.tsx', import.meta.url));
