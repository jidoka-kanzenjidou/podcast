// src/kafka/kafkaClient.js
import { Kafka, Admin, logLevel } from 'kafkajs';
import { config } from '../config.js';

const kafkaInstance: Kafka = new Kafka({
    logLevel: logLevel.WARN,
    clientId: config.kafka.clientId,
    brokers: config.kafka.brokers,
});

export const getKafkaConnection = (): Kafka => kafkaInstance;

export const getKafkaAdminConnection = (): Admin => {
    return kafkaInstance.admin();
};
