import { input, select } from '@inquirer/prompts';
import { aiEngines, chooseEngines, log, logHeader } from './utils.js';

// https://platform.openai.com/docs/guides/fine-tuning/use-a-fine-tuned-model

const engineChoices = await chooseEngines();
const engines = engineChoices.map((key) => aiEngines[key]);

let action;
do {
  action = await select({
    message: `Select action`,
    choices: [
      {
        name: 'Chat',
        value: 'chat',
      },
      {
        name: 'Recognize image',
        value: 'recognizeImage',
      },
      {
        name: 'Generate image',
        value: 'generateImage',
      },
      {
        name: 'Exit',
        value: false,
      },
    ],
  });

  switch (action) {
    case 'chat':
      const prompt = await input({ message: 'Prompt' });

      await Promise.all(
        engines.map(async (engine) => {
          const response = await engine.chat(prompt);
          logHeader(engine.title);
          log(response);
        })
      );

      break;
  }
} while (action);
