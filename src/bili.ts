import { PodcastVideoProcessor } from "./PodcastVideoProcessor.js";

const topic = 'prompt-to-video-dispatch';

(async function () {
    const processor = new PodcastVideoProcessor();
    await processor.processPodcastToVideo('Hãy tạo một podcast về công nghệ nano.')
})();
