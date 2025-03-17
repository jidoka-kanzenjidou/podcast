import { PodcastVideoOrchestrator } from "./PodcastVideoProcessor.js";

(async function () {
    const processor = new PodcastVideoOrchestrator();
    await processor.run('Hãy tạo một podcast về công nghệ nano.', 'nano technologies');
})();
