import axios, { AxiosResponse } from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

interface TextData {
  word: string;
  start: number;
  end: number;
}

export interface VideoCreationOptions {
  speechFilePath: string;
  musicFilePath: string;
  imageFilePaths: string[];
  textData: TextData[];
  videoSize?: [number, number];
  textConfig?: { font_color: string; background_color: string };
  fps?: number;
  duration: number;
  outputFilePath: string;
}

class VideoCreationService {
  private static API_URL =
    "https://http-chokkanteki-okane-production-80.schnworks.com/api/v1/video-creation/";

  /**
   * Orchestrates the video creation process.
   * @param options Video creation parameters
   */
  public static async createVideo(
    options: VideoCreationOptions
  ): Promise<string> {
    try {
      console.log("📤 Starting video creation process with options:", options);

      const absPaths = this.validateAndResolveFiles(options);
      const formData = this.prepareFormData(options, absPaths);
      const correlationId = await this.requestVideoCreation(formData);
      const videoBuffer = await this.pollForVideo(correlationId);
      await this.downloadVideo(videoBuffer, options.outputFilePath);

      console.log(`🎉 Video saved at: ${options.outputFilePath}`);
      return options.outputFilePath;
    } catch (error: any) {
      console.error("❌ Error creating video:", error);
      throw new Error("Failed to create video.");
    }
  }

  /**
   * Sends multiple video creation requests and returns their correlation IDs.
   * @param optionsArray Array of video creation parameters
   */
  public static async bulkRequestVideoCreation(
    optionsArray: VideoCreationOptions[]
  ): Promise<string[]> {
    try {
      console.log("📦 Starting bulk video creation requests...");

      const correlationIdPromises = optionsArray.map(async (options, index) => {
        console.log(`📝 Processing request ${index + 1} of ${optionsArray.length}`);
        const absPaths = this.validateAndResolveFiles(options);
        const formData = this.prepareFormData(options, absPaths);
        const correlationId = await this.requestVideoCreation(formData);
        return correlationId;
      });

      const correlationIds = await Promise.all(correlationIdPromises);

      console.log("✅ Bulk video creation requests submitted successfully.");
      console.log("Correlation IDs:", correlationIds);

      return correlationIds;
    } catch (error: any) {
      console.error("❌ Error in bulk video creation requests:", error);
      throw new Error("Bulk video creation requests failed.");
    }
  }

  /**
   * Polls for multiple videos using an array of correlation IDs.
   * @param correlationIds Array of correlation IDs to poll for video completion
   * @param outputFilePaths Array of output file paths to save downloaded videos
   * @param options Optional settings for polling behavior
   */
  public static async bulkPollForVideos(
    correlationIds: string[],
    outputFilePaths: string[],
    options?: {
      maxAttempts?: number;
      delay?: number;
      onProgress?: (index: number, attempt: number, progress?: number) => void;
      onSuccess?: (index: number, filePath: string) => void;
      onError?: (index: number, error: Error) => void;
    }
  ): Promise<void> {
    if (correlationIds.length !== outputFilePaths.length) {
      throw new Error("The number of correlation IDs must match the number of output file paths.");
    }

    let {
      maxAttempts = 12 * 15,
      delay = 5000,
      onProgress,
      onSuccess,
      onError
    } = options || {};
    maxAttempts *= correlationIds.length;
    delay *= correlationIds.length;

    console.log("⏳ Starting bulk polling for videos...");

    const pollPromises = correlationIds.map(async (correlationId, index) => {
      const outputFilePath = outputFilePaths[index];
      let attempts = 0;

      console.log(`📥 Polling for video ${index + 1} with Correlation ID: ${correlationId}`);

      while (attempts < maxAttempts) {
        try {
          console.log(`🔎 [Video ${index + 1}] Attempt ${attempts + 1} of ${maxAttempts}...`);

          const pollUrl = `${VideoCreationService.API_URL}${correlationId}`;
          const response = await this.fetchVideoStatus(pollUrl);
          const contentType = this.getContentType(response);

          if (this.isVideoReady(response, contentType)) {
            const videoBuffer = await this.downloadVideoBuffer(response);
            await this.downloadVideo(videoBuffer, outputFilePath);
            console.log(`✅ [Video ${index + 1}] Download complete: ${outputFilePath}`);
            onSuccess?.(index, outputFilePath);
            return;
          }

          let progress: number | undefined;
          if (contentType?.startsWith('application/json')) {
            const progressData = await response.json();
            progress = progressData.progress;
            console.log(`📊 [Video ${index + 1}] Progress: ${progress}%`);
          }

          onProgress?.(index, attempts, progress);

          attempts++;
          console.log(`🔁 [Video ${index + 1}] Waiting ${delay / 1000} seconds before next attempt...`);
          await this.delay(delay);

        } catch (error: any) {
          console.warn(`⚠️ [Video ${index + 1}] Polling error: ${error.message}`);
          attempts++;
          if (attempts >= maxAttempts) {
            console.error(`❌ [Video ${index + 1}] Reached max attempts. Giving up.`);
            onError?.(index, error);
            return;
          }
          await this.delay(delay);
        }
      }

      onError?.(index, new Error("Polling timed out"));
    });

    await Promise.all(pollPromises);

    console.log("🎉 Bulk polling completed!");
  }

  private static validateAndResolveFiles(options: VideoCreationOptions) {
    const absSpeechFilePath = path.resolve(options.speechFilePath);
    const absMusicFilePath = path.resolve(options.musicFilePath);
    const absImageFilePaths = options.imageFilePaths.map(imagePath => path.resolve(imagePath));

    if (!fs.existsSync(absSpeechFilePath)) {
      throw new Error(`Speech file not found at path: ${absSpeechFilePath}`);
    }

    if (!fs.existsSync(absMusicFilePath)) {
      throw new Error(`Music file not found at path: ${absMusicFilePath}`);
    }

    absImageFilePaths.forEach((imagePath) => {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found at path: ${imagePath}`);
      }
    });

    return { absSpeechFilePath, absMusicFilePath, absImageFilePaths };
  }

  private static prepareFormData(options: VideoCreationOptions, paths: {
    absSpeechFilePath: string,
    absMusicFilePath: string,
    absImageFilePaths: string[]
  }) {
    const formData = new FormData();

    formData.append("speech_file", fs.createReadStream(paths.absSpeechFilePath));
    formData.append("music_file", fs.createReadStream(paths.absMusicFilePath));

    paths.absImageFilePaths.forEach(imagePath => {
      formData.append("image_files", fs.createReadStream(imagePath));
    });

    formData.append("text_data", JSON.stringify(options.textData));
    formData.append("video_size", JSON.stringify(options.videoSize || [2560, 1440]));
    formData.append(
      "text_config",
      JSON.stringify(options.textConfig || { font_color: "white", background_color: "black" })
    );
    formData.append("fps", `${options.fps || 24}`);
    formData.append("duration", `${options.duration}`);

    return formData;
  }

  private static async requestVideoCreation(formData: FormData): Promise<string> {
    console.log("🚀 Sending request to video creation API");

    const response: AxiosResponse = await axios.post(VideoCreationService.API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    const correlationId = response.data['correlation_id'];
    console.log(`✅ Video processing started. Correlation ID: ${correlationId}`);

    return correlationId;
  }

  private static async pollForVideo(correlationId: string): Promise<Buffer> {
    const pollUrl = `${VideoCreationService.API_URL}${correlationId}`;
    let attempts = 0;
    const maxAttempts = 12 * 15;
    const delay = 5000;

    console.log(`⏳ Polling for video status. Correlation ID: ${correlationId}`);

    while (attempts < maxAttempts) {
      console.log(`🔎 Attempt ${attempts + 1} of ${maxAttempts}...`);

      const response = await this.fetchVideoStatus(pollUrl);
      const contentType = this.getContentType(response);

      if (this.isVideoReady(response, contentType)) {
        return await this.downloadVideoBuffer(response);
      }

      if (contentType?.startsWith('application/json')) {
        const data = await response.json();
        const progress = data.progress;
        console.log(`📊 Progress: ${progress}%`);
      }

      attempts++;
      console.log(`🔁 Waiting ${delay / 1000} seconds before next attempt...`);
      await this.delay(delay);
    }

    console.error("❌ Video processing timed out after maximum attempts.");
    throw new Error("Video processing timed out.");
  }

  private static async fetchVideoStatus(pollUrl: string): Promise<Response> {
    try {
      const response = await fetch(pollUrl);
      console.log(`📡 Received response. Status: ${response.status}`);

      if (!response.ok) {
        console.warn(`⚠️ Non-OK HTTP status: ${response.status}. Retrying...`);
      }

      return response;
    } catch (error) {
      console.warn("⚠️ Error occurred while polling for video:", (error as Error).message);
      throw error;
    }
  }

  private static getContentType(response: Response): string | null {
    const contentType = response.headers.get("content-type");
    console.log(`📑 Content-Type received: ${contentType}`);
    return contentType;
  }

  private static isVideoReady(response: Response, contentType: string | null): boolean {
    if (contentType === "video/mp4") {
      console.log("✅ Video processing completed! Video is ready to download.");
      return true;
    }

    console.log("⌛ Video is not ready yet. Retrying after delay...");
    return false;
  }

  private static async downloadVideoBuffer(response: Response): Promise<Buffer> {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async downloadVideo(videoBuffer: Buffer, outputFilePath: string): Promise<void> {
    try {
      fs.writeFileSync(outputFilePath, videoBuffer);
    } catch (error) {
      console.error("❌ Error downloading video:", error);
      throw new Error("Failed to download video.");
    }
  }
}

export default VideoCreationService;
