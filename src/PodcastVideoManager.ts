import VideoCreationService, { VideoCreationOptions } from "./VideoCreationService.js";

export class PodcastVideoManager {
    constructor() {}

    async processVideos(options: VideoCreationOptions[]): Promise<void> {
        try {
            console.debug('🚚 Requesting video creation...');
            const correlationIds = await this.requestVideoCreations(options);

            console.debug('⏳ Polling for video completion...');
            await this.pollForVideoCompletions(correlationIds, options.map(opt => opt.outputFilePath));

            console.log('🎉 All videos processed and downloaded!');
        } catch (error) {
            console.error('❌ Error processing videos:', error);
        }
    }

    private async requestVideoCreations(options: VideoCreationOptions[]): Promise<string[]> {
        console.debug('📨 Sending video creation request...');
        const ids = await VideoCreationService.bulkRequestVideoCreation(options);
        console.debug('✅ Correlation IDs received:', ids);
        return ids;
    }

    private async pollForVideoCompletions(correlationIds: string[], outputFilePaths: string[]): Promise<void> {
        console.debug('📡 Polling for video completions...');
        await VideoCreationService.bulkPollForVideos(
            correlationIds,
            outputFilePaths,
            {
                maxAttempts: 60 * 20,
                delay: 1000,
                onSuccess: (index, filePath) => {
                    console.log(`✅ [Clip ${index + 1}] Video completed at ${filePath}`);
                },
                onError: (index, error) => {
                    console.error(`❌ [Clip ${index + 1}] Failed after retries. Error: ${error.message}`);
                }
            }
        );
        console.debug('🏁 Finished polling.');
    }
}
