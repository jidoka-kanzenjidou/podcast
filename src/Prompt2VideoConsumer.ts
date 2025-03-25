import { EachMessagePayload } from "kafkajs";
import { startKafkaConsumer } from "./kafka/kafkaConsumer.js";

const topic = 'prompt-to-video-dispatch';

startKafkaConsumer({
    topic,
    groupId: 'prompt2video-consumer',
    eachMessageHandler: async (payload: EachMessagePayload) => {
        console.log(payload.message.value)
        console.log(payload.message.value?.toJSON())
    }
});

