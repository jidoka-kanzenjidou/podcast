import { EachMessagePayload } from "kafkajs";
import { startKafkaConsumer } from "./kafka/kafkaConsumer.js";
import { PodcastVideoProcessor } from "./PodcastVideoProcessor.js";
import { sendMessageToQueue } from "./utils/kafkaHelper.js";
import { config } from "./config.js"

interface KafkaMessagePayload {
    taskId?: string;
    accountId?: string;
    payload?: PromptPayload;
}

interface PromptPayload {
    prompt?: string;
    categoryHeading?: string;
    subitem?: string;
    impressionAlt?: string;
    accountId?: string;
}

const topic = 'prompt-to-video-dispatch';

function parseKafkaMessage(value: string): KafkaMessagePayload | null {
    try {
        console.debug("🔍 Attempting to parse Kafka message:", value);
        return JSON.parse(value || '') as KafkaMessagePayload;
    } catch (error) {
        console.error("❌ Message is not valid JSON", error);
        return null;
    }
}

function logPayloadDetails(payload: PromptPayload) {
    console.log("📝 Payload:", JSON.stringify(payload, null, 2));
    if (payload.prompt) console.log("💬 Prompt:", payload.prompt);
    if (payload.categoryHeading) console.log("🏷️ Category Heading:", payload.categoryHeading);
    if (payload.subitem) console.log("🔹 Subitem:", payload.subitem);
    if (payload.impressionAlt) console.log("🖼️ Impression Alt:", payload.impressionAlt);
    if (payload.accountId) console.log("👥 Payload Account ID:", payload.accountId);
}

async function handlePromptToVideoTask(payload: PromptPayload, taskId: string | undefined, accountId: number | undefined) {
    console.debug("🛠️ Starting task handling for Task ID:", taskId, "Account ID:", accountId);
    if (!taskId) {
        console.warn("⚠️ Missing taskId, cannot proceed with video processing.");
        return;
    }
    const processor = new PodcastVideoProcessor();
    processor.on('step', ({taskId, currentStep}) => {
        sendMessageToQueue(config.kafka.topics.harborProgress, {
            parentTaskId: taskId,
            currentStep,
        });
    })
    const finalOutputPath = await processor.processPodcastToVideo(payload.prompt!, taskId!);

    if (finalOutputPath) {
        console.debug("✅ Video processing complete. Output path:", finalOutputPath, payload);
        await sendMessageToQueue('prompt-to-video-response', {
            ...finalOutputPath,
            payload: null, // be hidden
            taskId,
            accountId,
        });
        console.debug("📤 Message sent to response queue with Task ID:", taskId);
    } else {
        console.log("⚠️ No output generated by processor for Task ID:", taskId);
    }
}

startKafkaConsumer({
    topic,
    groupId: 'prompt2video-consumer',
    eachMessageHandler: async ({ message }: EachMessagePayload) => {
        const value = message.value?.toString() || '';
        console.log("📩 Received message:", value);

        const json = parseKafkaMessage(value);
        if (!json) return;
        console.log("📦 Parsed JSON:", JSON.stringify(json, null, 2));

        if (json.taskId) console.log("🆔 Task ID:", json.taskId);
        if (json.accountId) console.log("👤 Account ID:", json.accountId);

        const payload = json.payload;
        if (payload?.prompt) {
            logPayloadDetails(payload);
            await handlePromptToVideoTask(payload, json.taskId, Number(json.accountId));
        } else {
            console.warn("⚠️ Missing prompt in payload for Task ID:", json.taskId);
        }
    }
});
