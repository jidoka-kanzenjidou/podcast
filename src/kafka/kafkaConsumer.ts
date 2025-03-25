
import { Kafka, Consumer, EachMessagePayload, Admin } from 'kafkajs';
import { getKafkaConnection } from './kafkaClient.js';

interface KafkaConsumerOptions {
    topic: string;
    groupId: string;
    eachMessageHandler: (payload: EachMessagePayload) => Promise<void>;
}

/**
 * Ensures the topic exists before subscribing.
 */
const ensureTopicExists = async (kafka: Kafka, topic: string): Promise<void> => {
    const admin: Admin = kafka.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    if (!topics.includes(topic)) {
        await admin.createTopics({
            topics: [{ topic }],
        });
        console.log(`📌 Topic created: ${topic}`);
    }
    await admin.disconnect();
};

/**
 * Starts a Kafka consumer with a given topic and message handler.
 */
export const startKafkaConsumer = async ({ topic, groupId, eachMessageHandler }: KafkaConsumerOptions): Promise<void> => {
    const kafka: Kafka = getKafkaConnection();
    const consumer: Consumer = kafka.consumer({ groupId });

    try {
        await ensureTopicExists(kafka, topic);
        await consumer.connect();
        console.log(`✅ Kafka Consumer connected (Group: ${groupId})`);

        await consumer.subscribe({ topic, fromBeginning: false });
        console.log(`🎧 Listening for messages on topic: ${topic}`);

        await consumer.run({ eachMessage: eachMessageHandler });
    } catch (error) {
        console.error(`❌ Error starting Kafka consumer for topic ${topic}:`, error);
    }

    // Handle graceful shutdown
    process.on('SIGTERM', async () => await shutdownKafkaConsumer(consumer));
    process.on('SIGINT', async () => await shutdownKafkaConsumer(consumer));
};

/**
 * Gracefully shuts down a Kafka consumer.
 */
const shutdownKafkaConsumer = async (consumer: Consumer): Promise<void> => {
    console.log('🔻 Shutting down Kafka Consumer...');
    try {
        await consumer.disconnect();
        console.log('✅ Kafka Consumer disconnected.');
    } catch (error) {
        console.error('❌ Error disconnecting Kafka Consumer:', error);
    }
};
