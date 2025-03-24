import { FindBestKeywordService } from "./FindBestKeywordService.js";
import BilingualPodcastService from "./BilingualPodcastService.js";
import { PodcastVideoProcessor } from "./PodcastVideoProcessor.js";

export class PodcastVideoOrchestrator {
    private svc: BilingualPodcastService;
    private processor: PodcastVideoProcessor;

    constructor() {
        this.svc = new BilingualPodcastService();
        this.processor = new PodcastVideoProcessor(this.svc);
    }

    async run(prompt: string): Promise<void> {
        console.debug('🏁 Starting PodcastVideoOrchestrator.run with prompt:', prompt);

        if (!(await this.processor.checkServiceHealth())) {
            console.debug('❌ Processor service health check failed, aborting run.');
            return;
        }

        console.debug('✅ Processor service is healthy. Proceeding to generate podcast.');

        const response = await this.processor.generatePodcast(prompt);
        console.debug('🎙️ Podcast generation response received:', response);

        const imageSearchQuery = await this.extractImageSearchQuery(prompt);
        console.debug('🔍 Extracted image search query:', imageSearchQuery);

        if (!imageSearchQuery) {
            console.error('❌ Failed to extract image search query.');
            throw new Error("Image search query extraction failed");
        }

        await this.processor.prepareImages(imageSearchQuery);
        console.debug('🖼️ Images prepared for query:', imageSearchQuery);

        await this.processor.handlePodcastResponse(response);
        console.debug('✅ Podcast response handled successfully.');
    }

    async extractImageSearchQuery(prompt: string): Promise<string | undefined> {
        console.debug('🔑 Extracting best keyword for image search from prompt:', prompt);

        const svc = new FindBestKeywordService();
        const keyword = await svc.runFindBestKeyword(prompt);

        console.debug('🔑 Best keyword extracted:', keyword);
        return keyword
            .trim()
            .replace(/^"(.*)"$/, '$1');
    }
}
