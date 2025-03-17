import { PodcastVideoProcessor } from "./PodcastVideoProcessor";

(async function () {
    const processor = new PodcastVideoProcessor('https://http-bairingaru-okane-production-80.schnworks.com');
    await processor.run('Hãy tạo một podcast về công nghệ nano.');
})();
