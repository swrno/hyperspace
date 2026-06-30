You have to save the apps in MongoDB apps Schema. Knowledge Base in MongoDB Knowledge Schema. 


And Connect Groq API to Each app so that we can mofify all the seetings that we can see in thr UI like Sys Prompt. 


When Ever I am creating an app in UI it should store all the info in MongoDB. Every app should have a APP_ID, API_KEY. Store A-Z info like model it currently selected. Temo, top_p, sys_prompt, User message as history. 







Which we will be using as Identification of a app. remove the Analytics (Last 7 Days) Section. 



We will use knoeledgebase id to segrigate the multitenent architecture in graph in a single instence of cognee. 

When ever someone will injest any doc
It will store that in cognee. Every node in cognee should have knowledge-base as property so that can can achieve data segrigation. 

when select any github repo. It will try to pick up all the info like repo .md file, commit messages, issues, and PR descriptipn and comments and ingest it in batches in the Knowledgebase. 

We will use Cognee as graph DB. 


On individual app page: 

On clicking on knowledge bases I should be able to see all the knowledge bases that I have access of and I should be able to connect Knowledge Base with the APP and that Should be the scope of the knowledge base. 
