import { getKafkaConnection } from '../kafka/kafkaClient.js';

const kafka = getKafkaConnection();
const producer = kafka.producer();
const admin = kafka.admin();
let existingTopics = new Set<string>();
(async () => {
    await producer.connect();
    await admin.connect();
    existingTopics = new Set(await admin.listTopics());
})();

const refreshTopics = async () => {
    existingTopics = new Set(await admin.listTopics());
};

const ensureTopicExists = async (topic: string) => {
    if (!existingTopics.has(topic)) {
        console.log(`Topic '${topic}' does not exist. Creating...`);
        await admin.createTopics({
            topics: [{ topic }],
        });
        console.log(`Topic '${topic}' created successfully.`);
        existingTopics.add(topic);
    }
};

export const sendMessageToQueue = async (topic: string, message: Record<string, unknown>): Promise<void> => {
    try {
        console.log(`Sending message to queue topic '${topic}':`, message);
        
        await ensureTopicExists(topic);
        
        await producer.send({
            topic,
            messages: [{ value: JSON.stringify({...message}) }],
        });
        
        console.log('Message sent to queue successfully');
    } catch (error) {
        console.error('Error sending message to queue:', error);
        throw error;
    }
};

const shutdown = async () => {
    console.log('Disconnecting Kafka producer...');
    await producer.disconnect();
    await admin.disconnect();
    console.log('Kafka producer disconnected');
};

setInterval(refreshTopics, 60000); // Refresh topic list every 60 seconds

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
