/**
 * Coherence Scorer - Measures conversation flow, thread continuity, and logical connections
 * Implements research-backed coherence metrics for dialogue systems
 */

import type { ConversationMessage } from '../types.js';
import { SemanticScorer } from './semantic-scorer.js';

interface CoherenceMetrics {
  threadContinuity: number;
  referenceChainStrength: number;
  informationDensity: number;
  topicConsistency: number;
}

interface MessageCluster {
  messages: ConversationMessage[];
  centroidTerms: Record<string, number>;
  topicScore: number;
}

export class CoherenceScorer {
  private readonly semanticScorer: SemanticScorer;
  private readonly windowSize: number;

  constructor(windowSize = 5) {
    this.semanticScorer = new SemanticScorer();
    this.windowSize = windowSize;
  }

  /**
   * Calculate overall coherence score for a message within conversation context
   */
  calculateCoherenceScore(
    message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): number {
    const metrics = this.calculateCoherenceMetrics(message, messageIndex, allMessages);
    
    // Weighted combination of coherence factors
    return (
      metrics.threadContinuity * 0.4 +
      metrics.referenceChainStrength * 0.3 +
      metrics.informationDensity * 0.2 +
      metrics.topicConsistency * 0.1
    );
  }

  /**
   * Calculate detailed coherence metrics for analysis
   */
  calculateCoherenceMetrics(
    message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): CoherenceMetrics {
    const threadContinuity = this.calculateThreadContinuity(message, messageIndex, allMessages);
    const referenceChainStrength = this.calculateReferenceChainStrength(message, allMessages);
    const informationDensity = this.calculateInformationDensity(message, messageIndex, allMessages);
    const topicConsistency = this.calculateTopicConsistency(message, messageIndex, allMessages);

    return {
      threadContinuity,
      referenceChainStrength,
      informationDensity,
      topicConsistency
    };
  }

  /**
   * Calculate thread continuity - how well message flows with surrounding context
   */
  private calculateThreadContinuity(
    message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): number {
    const contextWindow = this.getContextWindow(messageIndex, allMessages, this.windowSize);
    if (contextWindow.length === 0) return 0.5; // Neutral score for isolated messages

    let totalSimilarity = 0;
    let validComparisons = 0;

    for (const contextMsg of contextWindow) {
      if (contextMsg.id === message.id) continue;

      const similarity = this.semanticScorer.calculateSimilarity(
        message.content,
        contextMsg.content
      );

      // Weight recent messages more heavily
      const contextMsgIndex = allMessages.findIndex(m => m.id === contextMsg.id);
      if (contextMsgIndex === -1) continue;
      const recencyWeight = this.calculateRecencyWeight(messageIndex, contextMsgIndex, allMessages.length);

      totalSimilarity += similarity * recencyWeight;
      validComparisons += recencyWeight;
    }

    if (validComparisons === 0) return 0.3;

    const averageSimilarity = totalSimilarity / validComparisons;
    
    // Apply sigmoid normalization for smoother scoring
    return 1 / (1 + Math.exp(-6 * (averageSimilarity - 0.4)));
  }

  /**
   * Calculate reference chain strength - how well connected the message is to other messages
   */
  private calculateReferenceChainStrength(
    message: ConversationMessage,
    allMessages: readonly ConversationMessage[]
  ): number {
    let incomingReferences = 0;
    let outgoingReferences = 0;
    let semanticConnections = 0;

    // Extract potential message references from content
    const messageIdPattern = /msg_[a-zA-Z0-9]+/g;
    const fileRefPattern = /[\w-]+\.(js|ts|py|java|cpp|c|h|md|txt|json|xml|yaml|html|css)(?::\d+)?/g;

    const outgoingRefs = message.content.match(messageIdPattern) || [];
    const outgoingFileRefs = message.content.match(fileRefPattern) || [];
    outgoingReferences = outgoingRefs.length + outgoingFileRefs.length;

    // Count incoming references and semantic connections
    for (const otherMessage of allMessages) {
      if (otherMessage.id === message.id) continue;

      // Check for explicit references to this message
      if (otherMessage.content.includes(message.id)) {
        incomingReferences++;
      }

      // Check for file reference overlap
      const messageFiles = new Set(message.metadata.fileReferences);
      const otherFiles = new Set(otherMessage.metadata.fileReferences);
      const fileOverlap = this.setIntersectionSize(messageFiles, otherFiles);
      
      if (fileOverlap > 0) {
        semanticConnections += Math.min(1.0, fileOverlap / Math.max(messageFiles.size, otherFiles.size));
      }

      // Check for tool usage overlap
      const messageTools = new Set(message.metadata.toolsUsed);
      const otherTools = new Set(otherMessage.metadata.toolsUsed);
      const toolOverlap = this.setIntersectionSize(messageTools, otherTools);
      
      if (toolOverlap > 0) {
        semanticConnections += 0.3 * (toolOverlap / Math.max(messageTools.size, otherTools.size));
      }
    }

    // Normalize connection strength
    const totalConnections = incomingReferences + outgoingReferences + semanticConnections;
    const maxPossibleConnections = allMessages.length * 0.3; // Assume 30% max connection rate

    return Math.min(1.0, totalConnections / maxPossibleConnections);
  }

  /**
   * Calculate information density - how much new information the message contributes
   */
  private calculateInformationDensity(
    message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): number {
    const contextWindow = this.getContextWindow(messageIndex, allMessages, this.windowSize * 2);
    
    // Base information density from semantic richness
    const baseInformationDensity = this.semanticScorer.calculateSemanticDensity(message.content);
    
    // Novelty factor - how different this message is from recent context
    let noveltyScore = 1.0;
    if (contextWindow.length > 1) {
      const contextTexts = contextWindow
        .filter(m => m.id !== message.id)
        .map(m => m.content);
      
      let maxSimilarity = 0;
      for (const contextText of contextTexts) {
        const similarity = this.semanticScorer.calculateSimilarity(message.content, contextText);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }
      
      noveltyScore = 1 - maxSimilarity; // Higher novelty for less similar content
    }

    // Code/technical content bonus
    const codeBonus = message.metadata.codeBlocks.length > 0 ? 0.2 : 0;
    const toolBonus = message.metadata.toolsUsed.length > 0 ? 0.15 : 0;
    const errorBonus = message.metadata.hasError ? 0.25 : 0;

    // Content length factor (longer messages can contain more information)
    const lengthFactor = Math.min(1.0, Math.log(message.content.length + 1) / Math.log(1000));

    return Math.min(1.0, 
      baseInformationDensity * 0.4 +
      noveltyScore * 0.3 +
      lengthFactor * 0.1 +
      codeBonus +
      toolBonus +
      errorBonus
    );
  }

  /**
   * Calculate topic consistency - how well the message aligns with conversation topic
   */
  private calculateTopicConsistency(
    message: ConversationMessage,
    messageIndex: number,
    allMessages: readonly ConversationMessage[]
  ): number {
    // Create message clusters to identify topics
    const clusters = this.identifyMessageClusters(allMessages);
    if (clusters.length === 0) return 0.5;

    // Find the cluster this message belongs to most strongly
    let bestClusterScore = 0;
    for (const cluster of clusters) {
      const clusterScore = this.calculateClusterSimilarity(message, cluster);
      bestClusterScore = Math.max(bestClusterScore, clusterScore);
    }

    // Calculate recency weight for topic evolution
    const recencyWeight = this.calculateRecencyWeight(messageIndex, 0, allMessages.length);
    
    return bestClusterScore * (0.7 + 0.3 * recencyWeight);
  }

  /**
   * Identify topic clusters in the conversation
   */
  private identifyMessageClusters(allMessages: readonly ConversationMessage[]): MessageCluster[] {
    const clusters: MessageCluster[] = [];
    const processed = new Set<string>();

    for (const message of allMessages) {
      if (processed.has(message.id)) continue;

      const cluster: MessageCluster = {
        messages: [message],
        centroidTerms: {},
        topicScore: 0
      };

      // Find similar messages for this cluster
      for (const otherMessage of allMessages) {
        if (otherMessage.id === message.id || processed.has(otherMessage.id)) continue;

        const similarity = this.semanticScorer.calculateSimilarity(
          message.content,
          otherMessage.content
        );

        if (similarity > 0.3) { // Threshold for cluster membership
          cluster.messages.push(otherMessage);
          processed.add(otherMessage.id);
        }
      }

      processed.add(message.id);

      // Calculate cluster centroid and topic score
      this.updateClusterCentroid(cluster);
      clusters.push(cluster);
    }

    return clusters.filter(cluster => cluster.messages.length > 1); // Only return meaningful clusters
  }

  /**
   * Update cluster centroid based on member messages
   */
  private updateClusterCentroid(cluster: MessageCluster): void {
    const allTerms = new Set<string>();
    const termFreqs: Record<string, number> = {};

    // Collect all terms from cluster messages
    for (const message of cluster.messages) {
      const keyTerms = this.semanticScorer.extractKeyTerms(message.content, 20);
      for (const { term, weight } of keyTerms) {
        allTerms.add(term);
        termFreqs[term] = (termFreqs[term] || 0) + weight;
      }
    }

    // Normalize by cluster size
    for (const term of allTerms) {
      const freq = termFreqs[term];
      if (freq !== undefined) {
        cluster.centroidTerms[term] = freq / cluster.messages.length;
      }
    }

    // Calculate topic coherence score for the cluster
    cluster.topicScore = this.calculateClusterCoherence(cluster);
  }

  /**
   * Calculate coherence within a message cluster
   */
  private calculateClusterCoherence(cluster: MessageCluster): number {
    if (cluster.messages.length < 2) return 0;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < cluster.messages.length; i++) {
      for (let j = i + 1; j < cluster.messages.length; j++) {
        const msg1 = cluster.messages[i];
        const msg2 = cluster.messages[j];
        if (!msg1 || !msg2) continue;
        const similarity = this.semanticScorer.calculateSimilarity(
          msg1.content,
          msg2.content
        );
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calculate similarity between a message and a topic cluster
   */
  private calculateClusterSimilarity(message: ConversationMessage, cluster: MessageCluster): number {
    const messageTerms = this.semanticScorer.extractKeyTerms(message.content, 15);
    const messageTermMap: Record<string, number> = {};
    
    for (const { term, weight } of messageTerms) {
      messageTermMap[term] = weight;
    }

    // Calculate cosine similarity with cluster centroid
    let dotProduct = 0;
    let messageMagnitude = 0;
    let clusterMagnitude = 0;

    const allTerms = new Set([...Object.keys(messageTermMap), ...Object.keys(cluster.centroidTerms)]);

    for (const term of allTerms) {
      const messageWeight = messageTermMap[term] || 0;
      const clusterWeight = cluster.centroidTerms[term] || 0;

      dotProduct += messageWeight * clusterWeight;
      messageMagnitude += messageWeight * messageWeight;
      clusterMagnitude += clusterWeight * clusterWeight;
    }

    if (messageMagnitude === 0 || clusterMagnitude === 0) return 0;

    return dotProduct / (Math.sqrt(messageMagnitude) * Math.sqrt(clusterMagnitude));
  }

  /**
   * Get context window around a message
   */
  private getContextWindow(
    messageIndex: number,
    allMessages: readonly ConversationMessage[],
    windowSize: number
  ): ConversationMessage[] {
    const start = Math.max(0, messageIndex - windowSize);
    const end = Math.min(allMessages.length, messageIndex + windowSize + 1);
    
    return allMessages.slice(start, end) as ConversationMessage[];
  }

  /**
   * Calculate recency weight based on message position
   */
  private calculateRecencyWeight(messageIndex: number, referenceIndex: number, totalMessages: number): number {
    const distance = Math.abs(messageIndex - referenceIndex);
    const maxDistance = totalMessages - 1;
    
    if (maxDistance === 0) return 1.0;
    
    // Exponential decay based on distance
    return Math.exp(-2 * distance / maxDistance);
  }

  /**
   * Calculate intersection size between two sets
   */
  private setIntersectionSize<T>(set1: Set<T>, set2: Set<T>): number {
    let intersection = 0;
    for (const item of set1) {
      if (set2.has(item)) {
        intersection++;
      }
    }
    return intersection;
  }

  /**
   * Analyze conversation flow and identify potential coherence issues
   */
  analyzeConversationFlow(messages: readonly ConversationMessage[]): {
    averageCoherence: number;
    topicShifts: number;
    isolatedMessages: string[];
    strongClusters: MessageCluster[];
  } {
    let totalCoherence = 0;
    let topicShifts = 0;
    const isolatedMessages: string[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (!message) continue;
      const coherence = this.calculateCoherenceScore(message, i, messages);
      totalCoherence += coherence;
      
      // Detect topic shifts (low coherence with previous context)
      if (i > 0 && coherence < 0.3) {
        topicShifts++;
      }
      
      // Detect isolated messages (low coherence overall)
      if (coherence < 0.2) {
        isolatedMessages.push(message.id);
      }
    }

    const clusters = this.identifyMessageClusters(messages);
    const strongClusters = clusters.filter(c => c.topicScore > 0.5);

    return {
      averageCoherence: messages.length > 0 ? totalCoherence / messages.length : 0,
      topicShifts,
      isolatedMessages,
      strongClusters
    };
  }
}