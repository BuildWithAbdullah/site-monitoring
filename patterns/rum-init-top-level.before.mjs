// Identifiers set and the first beacon away before the banner has rendered.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';

monitor.init({ endpoint: '/rum', sampleRate: 0.2, release: BUILD_ID });
