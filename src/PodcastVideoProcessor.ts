import BilingualPodcastService from "genericcontentprocessor.ts/dist/BilingualPodcastService.js"
import { FindBestKeywordService } from "findbestkeywordservice.ts/dist/FindBestKeywordService.js"
import { GenericContentProcessor } from "genericcontentprocessor.ts/dist/GenericContentProcessor.js"
import { GenericVideoManager } from "genericcontentprocessor.ts/dist/GenericVideoManager.js"
import path from "path";

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
        const contentProcessor = new GenericContentProcessor(svc);
        const videoManager = new GenericVideoManager();

        if (!await contentProcessor.checkServiceHealth()) return;

        const query = await this.extractImageSearchQuery(prompt);
        if (!query) return;

        const response = await contentProcessor.generateContent(prompt);
        if (!response) return;

        const clips = contentProcessor.extractClipsFromResponse(response).map(clip=>{
            return {
                ...clip,
                query: query,
            }
        });
        if (clips.length === 0) return;

        const videoOptions = await contentProcessor.compileVideoCreationOptions(clips);
        if (videoOptions.length === 0) return;

        // Convert output paths to absolute paths
        const absVideoOptions = videoOptions.map(option => ({
            ...option,
            outputFilePath: path.resolve(option.outputFilePath)
        }));

        const finalOutputPath = path.resolve(`./output/final_podcast_video_${Date.now()}.mp4`);
        await videoManager.processVideos(absVideoOptions, finalOutputPath);

        console.log(`🚀 Podcast video processing complete. Output: ${finalOutputPath}`);

        return finalOutputPath
    }
}
