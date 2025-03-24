import BilingualPodcastService from "./BilingualPodcastService.js";
import { FindBestKeywordService } from "./FindBestKeywordService.js";
import { PodcastContentProcessor } from "./PodcastContentProcessor.js";
import { PodcastVideoManager } from "./PodcastVideoManager.js";

export class PodcastVideoProcessor {
    private async extractImageSearchQuery(prompt: string): Promise<string | undefined> {
        console.debug('🔑 Extracting best keyword for image search from prompt:', prompt);

        const svc = new FindBestKeywordService();
        const keyword = await svc.runFindBestKeyword(prompt);

        console.debug('🔑 Best keyword extracted:', keyword);
        return keyword
            .trim()
            .replace(/^"(.*)"$/, '$1');
    }

    async processPodcastToVideo(prompt: string) {
        const svc = new BilingualPodcastService();
        const contentProcessor = new PodcastContentProcessor(svc);
        const videoManager = new PodcastVideoManager();

        if (!await contentProcessor.checkServiceHealth()) return;

        const query = await this.extractImageSearchQuery(prompt)
        if (query) {
            await contentProcessor.prepareImages(query);

            const response = await contentProcessor.generatePodcast(prompt);
            if (!response) return;

            const clips = contentProcessor.extractClips(response);
            if (clips.length === 0) return;

            const videoOptions = await contentProcessor.getVideoCreationOptions(clips);
            if (videoOptions.length === 0) return;

            await videoManager.processVideos(videoOptions);
        }
    }
}
