import { EachMessagePayload } from "kafkajs";
import { startKafkaConsumer } from "./kafka/kafkaConsumer.js";

const topic = 'prompt-to-video-dispatch';

startKafkaConsumer({
    topic,
    groupId: 'prompt2video-consumer',
    eachMessageHandler: async ({ message }) => {
        const value = message.value?.toString();
        console.log("📩 Received message:", value);

        try {
            const json = JSON.parse(value || '');
            console.log("📦 Parsed JSON:");

            if (json.taskId) console.log("🆔 Task ID:", json.taskId);
            if (json.accountId) console.log("👤 Account ID:", json.accountId);

            const payload = json.payload;
            if (payload) {
                console.log("📝 Payload:");
                if (payload.prompt) console.log("💬 Prompt:", payload.prompt);
                if (payload.categoryHeading) console.log("🏷️ Category Heading:", payload.categoryHeading);
                if (payload.subitem) console.log("🔹 Subitem:", payload.subitem);
                if (payload.impressionAlt) console.log("🖼️ Impression Alt:", payload.impressionAlt);
                if (payload.accountId) console.log("👥 Payload Account ID:", payload.accountId);
            }
        } catch (err) {
            console.error("❌ Message is not valid JSON");
        }
    }
});