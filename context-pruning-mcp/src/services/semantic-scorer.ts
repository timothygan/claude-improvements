/**
 * Semantic Scorer - Implements semantic similarity scoring for contextual understanding
 * Uses vector-based similarity measures as a lightweight alternative to transformer embeddings
 */

import natural from 'natural';
import { removeStopwords } from 'stopword';

const { PorterStemmer } = natural;

interface SemanticVector {
  terms: Record<string, number>;
  magnitude: number;
}

export class SemanticScorer {
  private readonly conceptWords: Set<string>;

  constructor() {
    // Expand concept words to include technical, creative, and problem-solving domains
    this.conceptWords = new Set([
      // Technical concepts
      'algorithm', 'function', 'method', 'class', 'object', 'variable', 'constant',
      'interface', 'type', 'struct', 'enum', 'module', 'package', 'library',
      'framework', 'api', 'endpoint', 'database', 'query', 'schema', 'table',
      'index', 'cache', 'memory', 'performance', 'optimization', 'scale',
      'security', 'authentication', 'authorization', 'encryption', 'hash',
      'protocol', 'http', 'tcp', 'ssl', 'json', 'xml', 'yaml', 'config',
      
      // Development process
      'development', 'implementation', 'deployment', 'testing', 'debugging',
      'refactoring', 'maintenance', 'documentation', 'version', 'release',
      'build', 'compile', 'runtime', 'execution', 'process', 'thread',
      'async', 'sync', 'callback', 'promise', 'event', 'handler', 'listener',
      
      // Problem-solving concepts  
      'problem', 'solution', 'issue', 'challenge', 'approach', 'strategy',
      'analysis', 'design', 'pattern', 'architecture', 'structure', 'model',
      'workflow', 'process', 'pipeline', 'integration', 'system', 'component',
      
      // Quality and assessment
      'quality', 'reliability', 'stability', 'robustness', 'efficiency',
      'accuracy', 'precision', 'validation', 'verification', 'compliance',
      'standard', 'best practice', 'convention', 'guideline', 'principle',
      
      // Creative concepts
      'innovation', 'creativity', 'inspiration', 'imagination', 'exploration',
      'experimentation', 'prototype', 'concept', 'vision', 'possibility',
      'opportunity', 'potential', 'breakthrough', 'advancement', 'evolution'
    ]);
  }

  /**
   * Calculate semantic similarity between two texts using vector cosine similarity
   */
  calculateSimilarity(text1: string, text2: string): number {
    const vector1 = this.createSemanticVector(text1);
    const vector2 = this.createSemanticVector(text2);

    return this.cosineSimilarity(vector1, vector2);
  }

  /**
   * Calculate semantic density - how semantically rich a text is
   */
  calculateSemanticDensity(text: string): number {
    const terms = this.preprocessText(text);
    if (terms.length === 0) return 0;

    let conceptTerms = 0;
    let totalWeight = 0;

    for (const term of terms) {
      totalWeight += 1;
      if (this.conceptWords.has(term)) {
        conceptTerms += 2; // Concept terms get double weight
      }
    }

    // Semantic density is the ratio of concept terms to total terms
    const density = conceptTerms / totalWeight;
    
    // Apply logarithmic scaling to prevent overly high scores for keyword-dense text
    return Math.min(1.0, Math.log(1 + density * 2));
  }

  /**
   * Calculate contextual importance based on surrounding text
   */
  calculateContextualImportance(targetText: string, contextTexts: string[]): number {
    if (contextTexts.length === 0) return 0.5; // Neutral importance if no context

    const targetVector = this.createSemanticVector(targetText);
    let totalSimilarity = 0;
    let validComparisons = 0;

    for (const contextText of contextTexts) {
      const contextVector = this.createSemanticVector(contextText);
      const similarity = this.cosineSimilarity(targetVector, contextVector);
      
      if (similarity > 0) {
        totalSimilarity += similarity;
        validComparisons++;
      }
    }

    if (validComparisons === 0) return 0.3;

    const averageSimilarity = totalSimilarity / validComparisons;
    
    // Apply sigmoid function to normalize to 0-1 range with nice curve
    return 1 / (1 + Math.exp(-5 * (averageSimilarity - 0.5)));
  }

  /**
   * Calculate domain relevance score for a text given domain keywords
   */
  calculateDomainRelevance(text: string, domainKeywords: readonly string[]): number {
    if (domainKeywords.length === 0) return 0.5;

    const textTerms = new Set(this.preprocessText(text));
    const domainTermsSet = new Set(domainKeywords.map(kw => PorterStemmer.stem(kw.toLowerCase())));

    let matches = 0;
    let partialMatches = 0;

    for (const term of textTerms) {
      if (domainTermsSet.has(term)) {
        matches++;
      } else {
        // Check for partial matches (term contains or is contained in domain keyword)
        for (const domainTerm of domainTermsSet) {
          if (term.includes(domainTerm) || domainTerm.includes(term)) {
            partialMatches++;
            break;
          }
        }
      }
    }

    const totalRelevantTerms = matches + (partialMatches * 0.5);
    const maxPossibleMatches = Math.min(textTerms.size, domainTermsSet.size);
    
    if (maxPossibleMatches === 0) return 0;

    return Math.min(1.0, totalRelevantTerms / maxPossibleMatches);
  }

  /**
   * Create a semantic vector representation of text
   */
  private createSemanticVector(text: string): SemanticVector {
    const terms = this.preprocessText(text);
    const termFreq: Record<string, number> = {};

    // Count term frequencies with concept word weighting
    for (const term of terms) {
      const weight = this.conceptWords.has(term) ? 2 : 1;
      termFreq[term] = (termFreq[term] || 0) + weight;
    }

    // Apply TF-IDF-like weighting (simplified version)
    const processedTerms: Record<string, number> = {};
    let magnitudeSquared = 0;

    for (const [term, freq] of Object.entries(termFreq)) {
      // Simple TF weighting with log normalization
      const tfWeight = 1 + Math.log(freq);
      processedTerms[term] = tfWeight;
      magnitudeSquared += tfWeight * tfWeight;
    }

    return {
      terms: processedTerms,
      magnitude: Math.sqrt(magnitudeSquared)
    };
  }

  /**
   * Calculate cosine similarity between two semantic vectors
   */
  private cosineSimilarity(vector1: SemanticVector, vector2: SemanticVector): number {
    if (vector1.magnitude === 0 || vector2.magnitude === 0) return 0;

    let dotProduct = 0;
    const allTerms = new Set([...Object.keys(vector1.terms), ...Object.keys(vector2.terms)]);

    for (const term of allTerms) {
      const weight1 = vector1.terms[term] || 0;
      const weight2 = vector2.terms[term] || 0;
      dotProduct += weight1 * weight2;
    }

    return dotProduct / (vector1.magnitude * vector2.magnitude);
  }

  /**
   * Preprocess text: tokenize, remove stopwords, stem
   */
  private preprocessText(text: string): string[] {
    // Basic tokenization and normalization
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2); // Remove very short tokens

    // Remove stopwords
    const withoutStopwords = removeStopwords(tokens);

    // Apply stemming
    return withoutStopwords.map((token: string) => PorterStemmer.stem(token));
  }

  /**
   * Extract key terms from text for debugging
   */
  extractKeyTerms(text: string, limit = 10): Array<{ term: string; weight: number }> {
    const vector = this.createSemanticVector(text);
    
    return Object.entries(vector.terms)
      .map(([term, weight]) => ({ term, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }
}