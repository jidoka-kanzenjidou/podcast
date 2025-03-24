import { PodcastVideoOrchestrator } from "./PodcastVideoOrchestrator.js";

const topic = 'prompt-to-video-dispatch';

(async function () {
    const processor = new PodcastVideoOrchestrator();
    await processor.run('Hãy tạo một podcast về công nghệ nano.');
})();
