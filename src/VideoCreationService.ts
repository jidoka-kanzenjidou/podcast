import axios, { AxiosResponse } from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";

interface TextData {
  word: string;
  start: number;
  end: number;
}

interface VideoCreationOptions {
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
   * Uploads media files and text data to create a video.
   * @param options Video creation parameters
   */
  public static async createVideo(
    options: VideoCreationOptions
  ): Promise<string> {
    try {
      console.log("📤 Starting video creation process with options:", options);
      const formData = new FormData();

      // Convert to absolute paths
      const absSpeechFilePath = path.resolve(options.speechFilePath);
      const absMusicFilePath = path.resolve(options.musicFilePath);
      const absImageFilePaths = options.imageFilePaths.map(imagePath => path.resolve(imagePath));

      // Validate and attach speech file
      console.log(`🎙️ Validating speech file: ${absSpeechFilePath}`);
      if (!fs.existsSync(absSpeechFilePath)) {
        throw new Error(`Speech file not found at path: ${absSpeechFilePath}`);
      }
      console.log(`✅ Attaching speech file: ${absSpeechFilePath}`);
      formData.append("speech_file", fs.createReadStream(absSpeechFilePath));

      // Validate and attach music file
      console.log(`🎵 Validating music file: ${absMusicFilePath}`);
      if (!fs.existsSync(absMusicFilePath)) {
        throw new Error(`Music file not found at path: ${absMusicFilePath}`);
      }
      console.log(`✅ Attaching music file: ${absMusicFilePath}`);
      formData.append("music_file", fs.createReadStream(absMusicFilePath));

      // Validate and attach multiple image files
      absImageFilePaths.forEach((imagePath, index) => {
        console.log(`🖼️ Validating image file ${index + 1}: ${imagePath}`);

        if (!fs.existsSync(imagePath)) {
          console.error(`❌ Image file does not exist: ${imagePath}`);
          throw new Error(`Image file not found at path: ${imagePath}`);
        }

        console.log(`✅ Attaching image file ${index + 1}: ${imagePath}`);
        formData.append("image_files", fs.createReadStream(imagePath));
      });

      // Attach JSON data
      console.log("📝 Attaching text data:", typeof options.textData);
      formData.append("text_data", JSON.stringify(options.textData));
      formData.append("video_size", JSON.stringify(options.videoSize || [2560, 1440]));
      formData.append(
        "text_config",
        JSON.stringify(options.textConfig || { font_color: "white", background_color: "black" })
      );
      formData.append("fps", `${options.fps || 24}`);
      formData.append("duration", `${options.duration}`);

      // Make the request
      console.log("🚀 Sending request to video creation API with formData:", typeof formData);
      const response: AxiosResponse = await axios.post(VideoCreationService.API_URL, formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });

      const correlationId = response.data['correlation_id'];
      console.log(`✅ Video processing started. Correlation ID: ${correlationId}`);

      // Poll the API to check when the video is ready
      const videoBuffer = await VideoCreationService.pollForVideo(correlationId);

      // Download and save the video
      await VideoCreationService.downloadVideo(videoBuffer, options.outputFilePath);

      console.log(`🎉 Video saved at: ${options.outputFilePath}`);
      return options.outputFilePath;
    } catch (error) {
      console.error("❌ Error creating video:", error);
      throw new Error("Failed to create video.");
    }
  }

  /**
   * Polls the API until the video is ready.
   */
  private static async pollForVideo(correlationId: string): Promise<Buffer> {
    const pollUrl = `${VideoCreationService.API_URL}${correlationId}`;
    let attempts = 0;
    const maxAttempts = 12 * 5;
    const delay = 5000; // 5 seconds

    console.log(`⏳ Polling for video status. Correlation ID: ${correlationId}`);
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(pollUrl);
        const contentType = response.headers.get("content-type");

        if (contentType === "video/mp4") {
          const arrayBuffer = await response.arrayBuffer();
          console.log("✅ Video processing completed! Video is ready.");
          return Buffer.from(arrayBuffer);
        }
      } catch (error) {
        console.warn("⚠️ Error polling for video, retrying... Error:", (error as Error).message);
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    console.error("❌ Video processing timed out.");
    throw new Error("Video processing timed out.");
  }

  /**
   * Downloads the video from the given URL and saves it to a file.
   */
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
