/**
 * BM25 Scorer - Implements BM25 ranking algorithm for lexical matching
 * Based on Okapi BM25 formula for information retrieval
 */

import { removeStopwords } from 'stopword';
import natural from 'natural';
import type { BM25Parameters } from '../types.js';

const { PorterStemmer } = natural;

interface DocumentStats {
  termFreq: Record<string, number>;
  totalTerms: number;
  normalizedLength: number;
}

export class BM25Scorer {
  private readonly k1: number;
  private readonly b: number;
  private documentStats: DocumentStats[] = [];
  private globalTermFreq: Record<string, number> = {};
  private averageDocLength = 0;
  private totalDocuments = 0;

  constructor(parameters: BM25Parameters = { k1: 1.2, b: 0.75 }) {
    this.k1 = parameters.k1;
    this.b = parameters.b;
  }

  /**
   * Index a collection of documents for BM25 scoring
   */
  indexDocuments(documents: string[]): void {
    this.documentStats = [];
    this.globalTermFreq = {};
    this.totalDocuments = documents.length;
    
    let totalLength = 0;

    // Process each document
    for (const doc of documents) {
      const terms = this.preprocessText(doc);
      const termFreq: Record<string, number> = {};

      // Count term frequencies in this document
      for (const term of terms) {
        termFreq[term] = (termFreq[term] || 0) + 1;
        this.globalTermFreq[term] = (this.globalTermFreq[term] || 0) + 1;
      }

      const docStats: DocumentStats = {
        termFreq,
        totalTerms: terms.length,
        normalizedLength: terms.length
      };

      this.documentStats.push(docStats);
      totalLength += terms.length;
    }

    // Calculate average document length
    this.averageDocLength = this.totalDocuments > 0 ? totalLength / this.totalDocuments : 0;

    // Normalize document lengths
    for (const docStats of this.documentStats) {
      docStats.normalizedLength = docStats.totalTerms / this.averageDocLength;
    }
  }

  /**
   * Calculate BM25 score for a query against a specific document
   */
  calculateScore(query: string, documentIndex: number): number {
    if (documentIndex < 0 || documentIndex >= this.documentStats.length) {
      return 0;
    }

    const queryTerms = this.preprocessText(query);
    const docStats = this.documentStats[documentIndex];
    if (!docStats) return 0;
    let score = 0;

    for (const term of queryTerms) {
      const termFreqInDoc = docStats.termFreq[term] || 0;
      const termFreqInCorpus = this.globalTermFreq[term] || 0;

      if (termFreqInDoc === 0) continue;

      // Calculate IDF (Inverse Document Frequency)
      const idf = Math.log((this.totalDocuments - termFreqInCorpus + 0.5) / (termFreqInCorpus + 0.5));

      // Calculate term frequency component with saturation
      const tfComponent = (termFreqInDoc * (this.k1 + 1)) / 
                         (termFreqInDoc + this.k1 * (1 - this.b + this.b * (docStats?.normalizedLength ?? 1)));

      score += idf * tfComponent;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate BM25 scores for a query against all indexed documents
   */
  calculateScores(query: string): number[] {
    const scores: number[] = [];
    
    for (let i = 0; i < this.documentStats.length; i++) {
      scores.push(this.calculateScore(query, i));
    }

    return scores;
  }

  /**
   * Calculate similarity between two texts using BM25-style scoring
   */
  calculateSimilarity(text1: string, text2: string): number {
    // Temporarily index the two texts as a mini-corpus
    const originalStats = this.documentStats;
    const originalGlobalFreq = { ...this.globalTermFreq };
    const originalAvgLength = this.averageDocLength;
    const originalTotalDocs = this.totalDocuments;

    try {
      this.indexDocuments([text1, text2]);
      const score1 = this.calculateScore(text2, 0); // text2 as query, text1 as doc
      const score2 = this.calculateScore(text1, 1); // text1 as query, text2 as doc
      
      // Return normalized average similarity
      const maxPossibleScore = Math.max(
        this.calculateScore(text1, 0), // text1 against itself
        this.calculateScore(text2, 1)  // text2 against itself
      );

      return maxPossibleScore > 0 ? ((score1 + score2) / 2) / maxPossibleScore : 0;
    } finally {
      // Restore original state
      this.documentStats = originalStats;
      this.globalTermFreq = originalGlobalFreq;
      this.averageDocLength = originalAvgLength;
      this.totalDocuments = originalTotalDocs;
    }
  }

  /**
   * Preprocess text: tokenize, remove stopwords, stem, normalize
   */
  private preprocessText(text: string): string[] {
    // Basic tokenization and normalization
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
      .split(/\s+/)
      .filter(token => token.length > 1); // Remove single characters

    // Remove stopwords
    const withoutStopwords = removeStopwords(tokens);

    // Apply stemming
    const stemmed = withoutStopwords.map((token: string) => PorterStemmer.stem(token));

    return stemmed;
  }

  /**
   * Get term frequency statistics for debugging
   */
  getTermFrequencyStats(): Record<string, number> {
    return { ...this.globalTermFreq };
  }

  /**
   * Get document statistics for debugging
   */
  getDocumentStats(): DocumentStats[] {
    return [...this.documentStats];
  }

  /**
   * Clear all indexed data
   */
  clear(): void {
    this.documentStats = [];
    this.globalTermFreq = {};
    this.averageDocLength = 0;
    this.totalDocuments = 0;
  }
}