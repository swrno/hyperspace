import { addText, cognify } from '../api/cognee.js';

async function test() {
  const text = "Testing Swarnendu's Resume. Swarnendu worked at Fidelity Investments as a Data Science Intern. He built an AI platform named InfuseAI.";
  const userId = '48a757c6-eb05-4e40-a65a-65506b02df19';
  const kbId = '53032dc48ed8417098b3';

  console.log('Adding text...');
  const addRes = await addText(text, { userId, kbId, nodeSet: ['document'] });
  console.log('Add text result:', addRes);

  console.log('Triggering cognify...');
  const cogRes = await cognify(userId, { force: true, kbId });
  console.log('Cognify result:', cogRes);
}

test();
