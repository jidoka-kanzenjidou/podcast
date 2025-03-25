import { EachMessagePayload } from "kafkajs";
import { startKafkaConsumer } from "./kafka/kafkaConsumer.js";

const topic = 'prompt-to-video-dispatch';

startKafkaConsumer({
    topic,
    groupId: 'prompt2video-consumer',
    eachMessageHandler: async ({ message }) => {
        const value = message.value?.toString();
        console.log("Received message:", value);

        try {
            const json = JSON.parse(value || '');
            console.log("Parsed JSON:", json);
        } catch (err) {
            console.error("Message is not valid JSON");
        }
    }
});
