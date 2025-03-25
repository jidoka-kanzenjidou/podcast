import { PodcastVideoProcessor } from "./PodcastVideoProcessor.js";

(async function () {
    const processor = new PodcastVideoProcessor();
    const finalOutputPath = await processor.processPodcastToVideo('Hãy tạo một podcast về công nghệ nano.')
    console.log({
        finalOutputPath,
    })
})();
