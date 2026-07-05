import { HyperClient } from 'hypr-sdk';

const config = {
  apiKey: "",
  appId: "",
  clientId: "",
  userId: "", // your own end-user's id — not a hypr credential
  baseUrl: "http://localhost:3000", // local dev server; omit to hit production
  personalisation: true,
};

// Fast lookup, no personalization memory
// const simple = new HyperClient.simpleRetriver(config);
// const answer = await simple.query('My hackahton team for Cognee is Swarnendu, Haaris, Ankan, Soumyadeep. Remember this.');
// console.log('simpleRetriver:', answer);


// const simple = new HyperClient.simpleRetriver(config);
// const answer = await simple.query('Do you know Swarnendus Team?');
// console.log('simpleRetriver:', answer);

// Deep retrieval + this end-user's own memory
// const hyper = new HyperClient.hyperRetriever(config);
// const personalized = await hyper.query('My hackahton team for Cognee is Swarnendu, Haaris, Ankan, Soumyadeep. Remember this.');
// console.log('hyperRetriever:', personalized);


const hyper = new HyperClient.hyperRetriever(config);
const personalized = await hyper.query('Can you tell me the latest changes in last PR?');
console.log('hyperRetriever:', personalized);