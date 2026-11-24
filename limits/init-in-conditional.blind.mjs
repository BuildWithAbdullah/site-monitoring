// The init is unconditional as far as consent goes. It sits inside a condition
// about a feature flag, and this cannot know what a condition means, so an init
// inside any conditional is treated as gated.
import { monitor } from './vendor/monitor.mjs';
import { BUILD_ID } from './build.mjs';
import { featureFlags } from './flags.mjs';

if (featureFlags.realUserMonitoring) {
  monitor.init({ endpoint: '/rum', sampleRate: 0.2, release: BUILD_ID });
}
