import {
  chooseEngines,
  chooseProblemDirs,
  openai,
  urlToFile,
  logHeader,
  chooseTxt,
  getQuestions,
  logGreen,
  aiEngines,
  genAI,
} from './utils.js';

const engines = await chooseEngines();
const problemDirs = await chooseProblemDirs();

for (const dir of problemDirs) {
  logHeader(dir);

  const problemsFile = await chooseTxt('Choose problems file', dir);
  const questions = getQuestions(problemsFile);

  for (let i = 1; i < 51; i++) {
    const question = questions[i];

    logGreen(question);

    const prompt = `Generate image with handwritten this math problem without any more symbols or etc.: ${question}`;
    for (const engineKey of engines) {
      const engine = aiEngines[engineKey];

      logHeader(engine.title);
      switch (engineKey) {
        case 'openAI':
          const {
            data: {
              [0]: { url },
            },
          } = await openai.images.generate({
            model: 'dall-e-3',
            prompt,
            n: 1,
          });

          await urlToFile(url, dir, `${engine.title}_${i}.png`);
          break;

        case 'genAI':
          // TODO: not possible!!
          const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash-latest',
          });

          const result = await model.generateContentStream([prompt]);
          const foo = await result.response;
          console.log(result, foo.text());

          break;
      }
    }
  }
}
