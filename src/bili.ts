import { PodcastVideoProcessor } from "./PodcastVideoProcessor.js";

(async function () {
    const processor = new PodcastVideoProcessor();
    await processor.processPodcastToVideo('Hãy tạo một podcast về công nghệ nano.')
})();
