import select from '@inquirer/select';
import input from '@inquirer/input';
import * as comparison from 'string-comparison';

import { stringify } from 'csv-stringify/sync';

import dotenv from 'dotenv';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import chalk from 'chalk';

const log = console.log;
const logHeader = (message) => log(chalk.bold(`\n${message}`));
const logGray = (message) => log(chalk.gray(message));

dotenv.config();

import levenshtein from 'fast-levenshtein';
import natural from 'natural';

const eol = (content) => content.replace(/\r\n/gm, '\n').replace(/\r/gm, '\n');

const rootDir = './Tyrimo_failai';

const prefix = await input({
  message: 'Filename prefix',
  default: 'Similarity_',
});

const similarityFilename = `${prefix}${new Date()
  .toISOString()
  .replace(/[T\-\:]/g, '_')
  .replace(/\..+/, '')}.csv`;

// All dirs
const problemDirs = readdirSync(rootDir, { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

const answer = await select({
  message: `Found ${problemDirs.length} directories`,
  choices: [
    {
      name: 'process all',
      value: 'all',
      description: `all directories will be processed; similarities will be printed to the file in each directory: ${similarityFilename}`,
    },
    {
      name: 'single directory',
      value: 'dir',
      description: `single directory will be processed; similarities will be printed to the file: ${similarityFilename}`,
    },
  ],
});
log(answer);

switch (answer) {
  case 'all':
    for (const dir of problemDirs) {
      await processDir(dir, false);
    }
    break;

  case 'dir':
    const dir = await select({
      message: `Choose directory`,
      choices: problemDirs.map((dir) => ({
        name: dir,
        value: dir,
      })),
    });
    await processDir(dir);
    break;
}

async function processDir(dir) {
  logHeader(dir);

  const txtFiles = await glob([`${rootDir}/${dir}/*.txt`]);
  const source = await select({
    message: `Choose source file`,
    choices: [
      ...txtFiles.map((file) => ({
        name: file,
        value: file,
      })),
      {
        name: 'Skip dir',
        value: 'skip',
      },
    ],
  });

  if (source === 'skip') return;

  const target = await select({
    message: `Choose target file`,
    choices: [
      ...txtFiles.map((file) => ({
        name: file,
        value: file,
      })),
      {
        name: 'Skip dir',
        value: 'skip',
      },
    ],
  });

  if (target === 'skip') return;

  const stats = {
    files: {},
    average: {},
    questions: {},
  };

  const sourceText = eol(readFileSync(source, 'utf8'));
  const targetText = eol(readFileSync(target, 'utf8'));

  stats.files = similarity(sourceText, targetText);

  const sourceQuestions = getQuestions(sourceText);
  const targetQuestions = getQuestions(targetText);

  for (let i = 1; i < 51; i++) {
    stats.questions[i] = similarity(sourceQuestions[i], targetQuestions[i]);
  }

  // averages
  const algorithms = Object.keys(stats.files);
  const questionKeys = Object.keys(stats.questions);

  for (const algo of algorithms) {
    stats.average[algo] = 0;

    for (const key of questionKeys) {
      stats.average[algo] += Number(stats.questions[key][algo]);
    }

    stats.average[algo] /= questionKeys.length;
  }

  const filePath = `${rootDir}/${dir}/${similarityFilename}`;

  const content = stringify([
    ['sep=,'],
    [('Source file', source)],
    ['Target file', target],
    [],
    ['', ...algorithms],
    ['Files', ...algorithms.map((algo) => stats.files[algo].toFixed(2))],
    ['Averages', ...algorithms.map((algo) => stats.average[algo].toFixed(2))],
    ...Object.keys(stats.questions).map((qId) => [
      qId,
      ...algorithms.map((algo) => stats.questions[qId][algo].toFixed(2)),
    ]),
  ]);

  logHeader(`Printing to file`);
  logGray(filePath);

  writeFileSync(filePath, content);
}

function getQuestions(content) {
  const matches = [
    ...`\n\n${content}\n\n`.matchAll(/(\d+)\. ([\s\S]*?)(\n\n)/gm),
  ];

  return matches.reduce((obj, match) => {
    return {
      ...obj,
      [match[1]]: match[2].trim(),
    };
  }, {});
}

function similarity(text1, text2) {
  return {
    levenshtein: levenshteinSimilarity(text1, text2),
    jaccard: jaccardSimilarity(text1, text2),
    cosine: cosineSimilarity(text1, text2),
    npm_cosine: comparison.default.cosine.similarity(text1, text2) * 100,
    npm_diceCoefficient:
      comparison.default.diceCoefficient.similarity(text1, text2) * 100,
    npm_jaccardIndex:
      comparison.default.jaccardIndex.similarity(text1, text2) * 100,
    npm_levenshtein:
      comparison.default.levenshtein.similarity(text1, text2) * 100,
    npm_lcs: comparison.default.lcs.similarity(text1, text2) * 100,
    npm_longestCommonSubsequence:
      comparison.default.longestCommonSubsequence.similarity(text1, text2) *
      100,
    npm_mlcs: comparison.default.mlcs.similarity(text1, text2) * 100,
    npm_metricLcs: comparison.default.metricLcs.similarity(text1, text2) * 100,
    npm_jaroWinkler:
      comparison.default.jaroWinkler.similarity(text1, text2) * 100,
  };
}

function cosineSimilarity(text1, text2) {
  const tokenizer = new natural.WordTokenizer();

  // Tokenize texts
  const tokens1 = tokenizer.tokenize(text1.toLowerCase());
  const tokens2 = tokenizer.tokenize(text2.toLowerCase());

  // Build a combined vocabulary
  const vocabulary = Array.from(new Set([...tokens1, ...tokens2]));

  // Create term frequency vectors
  const termFrequency = (tokens, vocabulary) => {
    const tf = new Array(vocabulary.length).fill(0);
    tokens.forEach((token) => {
      const index = vocabulary.indexOf(token);
      if (index !== -1) {
        tf[index]++;
      }
    });
    return tf;
  };

  const vectorA = termFrequency(tokens1, vocabulary);
  const vectorB = termFrequency(tokens2, vocabulary);

  // Function to compute Cosine Similarity between two vectors
  const cosineSimilarity2 = (vecA, vecB) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0; // Handle division by zero

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // Calculate cosine similarity
  const similarity = cosineSimilarity2(vectorA, vectorB);
  const similarityPercentage = similarity * 100;
  return similarityPercentage;
}

function jaccardSimilarity(text1, text2) {
  // Function to tokenize text into unique words
  const tokenize = (text) => {
    return new Set(text.toLowerCase().split(/\W+/).filter(Boolean));
  };

  // Tokenize the texts
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  // Calculate the intersection and union of tokens
  const intersection = new Set(
    [...tokens1].filter((token) => tokens2.has(token))
  );
  const union = new Set([...tokens1, ...tokens2]);

  // Calculate Jaccard Index
  const jaccardIndex = intersection.size / union.size;

  // Convert Jaccard Index to percentage
  const similarityPercentage = jaccardIndex * 100;
  return similarityPercentage;
}

function levenshteinSimilarity(text1, text2) {
  const levenshteinDistance = levenshtein.get(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);

  // Calculate similarity percentage
  const similarityPercentage =
    ((maxLength - levenshteinDistance) / maxLength) * 100;

  return similarityPercentage;
}
