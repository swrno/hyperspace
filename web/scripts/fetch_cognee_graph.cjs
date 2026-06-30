const fs = require('fs');

const COGNEE_BASE_URL = 'https://tenant-0610c5b7-3a67-48bf-ac6d-19da99772b30.aws.cognee.ai';
const COGNEE_API_KEY = 'dbf1f23e0d5c320ec2621bf2819ca4613d02dcb82fe580818d2f3c4aaefca3a1';

async function fetchGraph() {
  console.log('Fetching datasets from Cognee...');
  
  const headers = { 'X-API-Key': COGNEE_API_KEY };
  
  const res = await fetch(`${COGNEE_BASE_URL}/api/v1/datasets/`, { headers });
  if (!res.ok) {
    console.error('Failed to fetch datasets:', res.status, await res.text());
    return;
  }
  
  const datasets = await res.json();
  console.log(`Found ${datasets.length} datasets.`);
  
  const allNodes = [];
  const allEdges = [];
  
  for (const ds of datasets) {
    const id = ds.id || ds.dataset_id;
    const name = ds.name || ds.dataset_name;
    console.log(`Fetching graph for dataset: ${name} (${id})...`);
    
    try {
      const gRes = await fetch(`${COGNEE_BASE_URL}/api/v1/datasets/${id}/graph`, { headers });
      if (gRes.ok) {
        const graphData = await gRes.json();
        
        // Some responses might wrap data
        const nodes = graphData.nodes || [];
        const edges = graphData.edges || [];
        
        allNodes.push(...nodes);
        allEdges.push(...edges);
        console.log(` -> Fetched ${nodes.length} nodes, ${edges.length} edges.`);
      } else {
        console.error(` -> Failed to fetch graph for ${name}: ${gRes.status}`);
      }
    } catch (e) {
      console.error(` -> Error fetching graph for ${name}:`, e.message);
    }
  }
  
  const output = {
    totalNodes: allNodes.length,
    totalEdges: allEdges.length,
    nodes: allNodes,
    edges: allEdges
  };
  
  fs.writeFileSync('cognee_graph.json', JSON.stringify(output, null, 2));
  console.log('Successfully saved to cognee_graph.json!');
}

fetchGraph();
