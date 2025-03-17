import { PodcastVideoOrchestrator } from "./PodcastVideoProcessor.js";

(async function () {
    const processor = new PodcastVideoOrchestrator('https://http-bairingaru-okane-production-80.schnworks.com');
    await processor.run('Hãy tạo một podcast về công nghệ nano.', 'nano technologies');
})();
