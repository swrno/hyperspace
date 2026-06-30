const COGNEE_BASE_URL = 'https://tenant-0610c5b7-3a67-48bf-ac6d-19da99772b30.aws.cognee.ai';
const COGNEE_API_KEY = 'dbf1f23e0d5c320ec2621bf2819ca4613d02dcb82fe580818d2f3c4aaefca3a1';

async function cleanCognee() {
  console.log('Fetching datasets to delete from Cognee Cloud...');
  
  const headers = { 'X-API-Key': COGNEE_API_KEY };
  
  const res = await fetch(`${COGNEE_BASE_URL}/api/v1/datasets/`, { headers });
  if (!res.ok) {
    console.error('Failed to fetch datasets:', res.status, await res.text());
    return;
  }
  
  const datasets = await res.json();
  console.log(`Found ${datasets.length} datasets.`);
  
  for (const ds of datasets) {
    const id = ds.id || ds.dataset_id;
    const name = ds.name || ds.dataset_name;
    console.log(`Deleting dataset: ${name} (${id})...`);
    
    try {
      const delRes = await fetch(`${COGNEE_BASE_URL}/api/v1/datasets/${id}`, { 
        method: 'DELETE',
        headers 
      });
      if (delRes.ok) {
        console.log(` -> Successfully deleted ${name}.`);
      } else {
        console.error(` -> Failed to delete ${name}: ${delRes.status} ${await delRes.text()}`);
      }
    } catch (e) {
      console.error(` -> Error deleting ${name}:`, e.message);
    }
  }
  
  console.log('Finished cleaning Cognee Cloud datasets!');
}

cleanCognee();
