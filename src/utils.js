import dotenv from 'dotenv';
import OpenAI from 'openai';
import { checkbox, select } from '@inquirer/prompts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { glob } from 'glob';

dotenv.config();

export async function urlToFile(url, dir, file) {
  const fetchFile = await fetch(url);
  const responseBlob = await fetchFile.blob();
  const arrayBuffer = await responseBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const filePath = path.join(dataPath, dir, file);

  fs.writeFileSync(filePath, buffer);
}

export const dataPath = './Tyrimo_failai';

export const problemDirs = fs
  .readdirSync(dataPath, {
    withFileTypes: true,
  })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

export const chooseProblemDirs = () =>
  checkbox({
    message: `Select problem directories`,
    choices: problemDirs.map((dir) => ({
      name: dir,
      value: dir,
      //      value: path.join(dataPath, dir),
    })),
  });

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const aiEngines = {
  genAI: {
    title: 'GoogleGenerativeAI',
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },

    async generateImage() {
      return 'NOT_IMPLEMENTED';
    },

    async recognizeImage(
      base64,
      prompt = 'Recognize handwritten text in a photo. Do not add anything else, just a text in a photo.'
    ) {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));

      try {
        const { response } = await model.generateContent([
          prompt,
          { inlineData: { data: base64, mimeType: 'image/jpeg' } },
        ]);

        return response.candidates?.[0]?.content?.parts?.[0].text || '';
      } catch (e) {
        console.error(e);
        return e.message;
      }
    },

    async chat(prompt) {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));

      try {
        const { response } = await model.generateContent([prompt]);

        return response.candidates?.[0]?.content?.parts?.[0].text || '';
      } catch (e) {
        console.error(e);
        return e.message;
      }
    },
  },

  openAI: {
    title: 'OpenAI',
    totalUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },

    async generateImage(prompt) {
      const {
        data: {
          [0]: { url },
        },
      } = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
      });

      return url;
    },

    async recognizeImage(
      base64,
      prompt = 'Recognize handwritten text in a photo. Do not add anything else, just a text in a photo.'
    ) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
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
        max_tokens: 512,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });

      return response.choices[0].message.content || '';
    },

    async chat(prompt) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        temperature: 1,
        max_tokens: 512,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });

      return response.choices[0].message.content || '';
    },
  },
};

export const chooseEngines = () =>
  checkbox({
    message: 'Select AI engines',
    choices: Object.keys(aiEngines).map((engine) => ({
      name: aiEngines[engine].title,
      value: engine,
    })),
  });

export const chooseTxt = async (message, dir) => {
  const txtFiles = await glob([path.join(dataPath, dir, '*.txt')]);
  return select({
    message,
    choices: txtFiles.map((file) => ({
      name: file,
      value: file,
    })),
  });
};

export const unifyEol = (content) =>
  content.replace(/\r\n/gm, '\n').replace(/\r/gm, '\n');

export function getQuestions(path) {
  const content = unifyEol(fs.readFileSync(path, 'utf8'));

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

export const log = console.log;
export const logHeader = (message) => log(chalk.bold(`\n${message}`));
export const logGreen = (message) => log(chalk.green(`\n${message}`));
const logGray = (message) => log(chalk.gray(message));
