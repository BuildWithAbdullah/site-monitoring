// The same init with nothing around it at all.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';

monitor.init({ endpoint: '/rum', sampleRate: 0.2, release: BUILD_ID });
