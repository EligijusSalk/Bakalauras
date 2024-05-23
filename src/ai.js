import select from '@inquirer/select';
import confirm from '@inquirer/confirm';
import checkbox from '@inquirer/checkbox';

import dotenv from 'dotenv';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import OpenAI from 'openai';
import chalk from 'chalk';

import { GoogleGenerativeAI } from '@google/generative-ai';

// Unify end-of-line symbols
const eol = (content) =>
  content.replace(/\r\n/gm, '\n').replace(/\r/gm, '\n').replace(/\n\n/g, '\n');

const log = console.log;
const logHeader = (message) => log(chalk.bold(`\n${message}`));
const logGreen = (message) => log(chalk.green(`\n${message}`));
const logGray = (message) => log(chalk.gray(message));

dotenv.config();

const rootDir = './Tyrimo_failai';

// Date format for answer files
const date = new Date()
  .toISOString()
  .replace(/[T\-\:]/g, '_')
  .replace(/\..+/, '');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const aiEngines = {
  genAI: {
    title: 'GoogleGenerativeAI',
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    answersFilename: `Gemini_Answers_${date}.txt`,
    handle: async (base64) => {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));

      try {
        const { response } = await model.generateContent([
          'Recognize handwritten text in a photo. Do not add anything else, just a text in a photo.',
          { inlineData: { data: base64, mimeType: 'image/jpeg' } },
        ]);

        return {
          usage: {
            prompt_tokens: response.usageMetadata.promptTokenCount,
            completion_tokens: response.usageMetadata.candidatesTokenCount,
            total_tokens: response.usageMetadata.totalTokenCount,
          },
          message: response.candidates?.[0]?.content?.parts?.[0].text || '',
        };
      } catch (e) {
        console.error(e);
        return {
          message: '',
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        };
      }
    },
  },
  openAI: {
    title: 'OpenAI',
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    answersFilename: `GPT4o_Answers_${date}.txt`,
    handle: async (base64) => {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Reikia nuskaityti visas šias nuotraukas ir parašyti juose esantį tekstą kuo tiksliau nepridedant jokio papildomo teksto.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 1,
        max_tokens: 1024,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });

      return {
        usage: response.usage,
        message: response.choices[0].message.content,
      };
    },
  },
};

// Allow to choose AI engines
const engines = await checkbox({
  message: 'Select AI engines',
  choices: Object.keys(aiEngines).map((engine) => ({
    name: aiEngines[engine].title,
    value: engine,
  })),
});

// Read problem dirs
const problemDirs = readdirSync(rootDir, { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

// Choose dirs to process
const answer = await select({
  message: `Found ${problemDirs.length} directories`,
  choices: [
    {
      name: 'process all',
      value: 'all',
    },
    {
      name: 'single directory',
      value: 'dir',
    },
    {
      name: 'single file',
      value: 'file',
    },
  ],
});

switch (answer) {
  case 'all':
    for (const dir of problemDirs) {
      await processDir(dir, false);
    }
    break;

  case 'dir':
  case 'file':
    const dir = await select({
      message: `Choose directory`,
      choices: problemDirs.map((dir) => ({
        name: dir,
        value: dir,
      })),
    });
    await processDir(dir, answer === 'file');
    break;
}

for (const engineKey of engines) {
  logHeader(`Total usage: ${aiEngines[engineKey].title}`);
  logGray(JSON.stringify(aiEngines[engineKey].totalUsage));
}

async function processDir(dir, singleFile = false) {
  logHeader(dir);
  const images = await glob([
    `${rootDir}/${dir}/*.{png,jpg,jpeg,PNG,JPG,JPEG}`,
  ]);

  if (singleFile) {
    const image = await select({
      message: `Choose image`,
      choices: images.map((image) => ({
        name: image,
        value: image,
      })),
    });

    let repeat = false;
    do {
      await processImage(image);
      repeat = await confirm({ message: 'Try again?' });
    } while (repeat);
  } else {
    logGray(`Total images: ${images.length}`);
    logHeader(`Processing images`);
    const responses = [];

    for (const image of images) {
      const response = await processImage(image);
      responses.push(response);
    }

    // sort
    responses.sort((a, b) => a.id - b.id);

    for (const engineKey of engines) {
      const engine = aiEngines[engineKey];
      const filePath = `${rootDir}/${dir}/${engine.answersFilename}`;
      const content = responses
        .map((item) => `${item.id}. ${item.messages[engineKey]}`)
        .join('\n\n');

      logHeader(`Printing to file`);
      logGray(filePath);
      writeFileSync(filePath, content);
    }
  }
}

async function processImage(image) {
  const { [1]: id } = /_(\d*)\./gm.exec(image);
  const base64 = readFileSync(image, 'base64');

  logGreen(`${id} (${image})`);

  const messages = {};
  for (const engineKey of engines) {
    const engine = aiEngines[engineKey];
    logHeader(engine.title);

    const response = await engine.handle(base64);
    const message = eol(response.message).trim();
    const usage = response.usage;

    messages[engineKey] = message;

    Object.keys(usage).forEach((key) => (engine.totalUsage[key] += usage[key]));
    log(message);
    logGray(JSON.stringify(usage));
  }

  return { id: Number(id), messages };
}
